# Phase 0 : cadrage technique

Date : 2026-10-03. Statut : **validée le 2026-10-03**.

Décisions validées :
- file de tâches : option A, Trigger.dev pour l'orchestration et Modal pour le calcul ;
- langues : français et anglais uniquement ;
- plans tarifaires : validés tels que proposés en section 4 ;
- staging : déployé via GitHub Actions, avec les secrets dans l'environnement GitHub « staging ».

Ce document regroupe les décisions proposées pour la phase 0 : fournisseurs, architecture, coûts estimés, plans tarifaires, comptes à créer et écarts constatés avec le brief initial.

> Limite de vérification : depuis l'environnement de développement, le proxy réseau bloque l'accès direct à deepgram.com, assemblyai.com, modal.com, trigger.dev, developers.google.com et developers.tiktok.com. Les chiffres ci-dessous viennent des extraits de recherche, en privilégiant les domaines officiels. Ils seront revérifiés sur les pages officielles avant chaque intégration (voir la section 8).

---

## 1. Skills de design : ce qu'ils imposent

Les skills `design-taste-frontend`, `imagegen-frontend-web`, `image-to-code`, `brandkit` et `web-design-guidelines` sont déjà disponibles dans cet environnement (synchronisés depuis le compte), donc je ne les ai pas copiés dans `.claude/skills/`.

1. **Image d'abord, code ensuite.** Une image de référence horizontale par section de la landing page et par écran, puis une analyse détaillée, puis une implémentation fidèle. **Aucun outil de génération d'images n'est disponible ici**, donc je passerai par des maquettes décrites en texte (voir la section 9).
2. **Discipline anti-« slop ».** Pas de dégradé violet d'IA, pas d'Inter par défaut, pas de 3 cartes identiques, pas de tiret cadratin, au plus 1 « eyebrow » pour 3 sections, un seul accent de couleur, un seul système d'arrondis, pas de fausses captures d'écran construites en `div`.
3. **Stack imposée.** Next.js (Server Components), Tailwind v4, Motion (`motion/react`), icônes Phosphor, `next/font`, mode clair et sombre dès le départ, `prefers-reduced-motion` respecté, `min-h-[100dvh]`.
4. **Hero et marque.** Hero tenant dans le premier écran (titre de 2 lignes max, sous-titre de 20 mots max, 4 éléments de texte max). Logo symbolique pensé à partir du métier, palette disciplinée, planche de marque 3×3.
5. **Audit final.** Liste de pré-vérification complète, plus audit `web-design-guidelines` (règles Vercel téléchargées au moment de l'audit) avec les écarts au format `fichier:ligne`.

Note de périmètre : `design-taste-frontend` se déclare hors sujet pour les tableaux de bord et l'admin. Il s'applique pleinement à la landing page. Pour l'application, j'appliquerai ses règles de couleur, de typographie, d'états et d'accessibilité sur une base de composants accessibles (shadcn/ui personnalisé, un seul système pour tout le projet).

---

## 2. Architecture retenue

```
Navigateur (Next.js sur Vercel)
  │  auth, CRUD, URLs signées, webhooks Stripe
  ▼
Supabase (Postgres + Auth + RLS + Realtime)  ◄── progression des jobs en temps réel
  │  insertion d'un job
  ▼
Orchestrateur (Trigger.dev, en TypeScript) ── reprises, étapes, cron RSS
  │  appel HTTP authentifié
  ▼
Workers Modal (Python + FFmpeg + MediaPipe) ── téléchargement, transcodage, rendu
  │                    │
  ▼                    ▼
Cloudflare R2     AssemblyAI (transcription)  +  API Claude (segments)
(vidéos, URLs signées, suppression automatique via règles de cycle de vie)
```

### 2.1 Hébergement des workers : **Modal** (recommandé)

| Critère | Modal | Fly.io | Railway |
|---|---|---|---|
| Modèle | Serverless, mise à zéro automatique, facturation à la seconde | Machines à démarrer et arrêter soi-même | Conteneurs persistants, facturés à l'usage |
| Prix CPU | 0,0000131 $/cœur physique/s (1 cœur = 2 vCPU) + 0,00000222 $/Gio/s | performance-1x : 0,0431 $/h (1 CPU, 2 Go) | 20 $/vCPU/mois + 10 $/Go/mois |
| 4 vCPU + 8 Go pendant 1 h | ≈ 0,16 $ | ≈ 0,17 $ (performance-2x) | ≈ 0,22 $ en continu, sans mise à zéro native |
| Tâches longues | Timeout configurable, jusqu'à plusieurs heures | Oui | Oui |
| Python, FFmpeg, MediaPipe | Image définie en Python, natif | Dockerfile | Dockerfile |
| Gratuit | 30 $ de crédit par mois | Non | Essai |
| Simplicité | Très élevée : `modal deploy`, pas d'infra à gérer | Moyenne : gestion des machines | Élevée, mais facturé même au repos |

Choix : **Modal**. C'est le meilleur rapport coût/simplicité pour une charge irrégulière (pics à chaque vidéo, rien entre les deux), avec un passage simple au GPU si on accélère le rendu ou la détection de visages plus tard.

### 2.2 File de tâches : décision à valider (deux options)

Les deux options utilisent Modal pour le calcul lourd.

- **Option A : Trigger.dev (orchestration) + Modal (calcul)** — *recommandée*
  - Pour : reprise par étape, tentatives avec backoff, tableau de bord des exécutions, cron pour la surveillance RSS, temps réel natif. Les attentes ne sont pas facturées, et l'orchestration elle-même ne consomme presque pas de calcul.
  - Contre : un compte de plus. Trigger.dev est en TypeScript (Python ne passe que par une extension), donc le calcul reste sur Modal. Deux tableaux de bord à surveiller.
- **Option B : Modal seul (fonctions + tentatives + cron), avec l'état des étapes dans Postgres**
  - Pour : un fournisseur de moins, le moins cher, tout le pipeline en Python.
  - Contre : je dois écrire moi-même la reprise par étape (points de reprise idempotents dans la table `jobs`), et il n'y a pas d'interface d'exécution prête à l'emploi. L'admin interne compense en partie.

Pourquoi pas Trigger.dev pour tout : ses machines coûtent environ 7 fois plus cher que Modal à configuration égale (large-1x, 4 vCPU et 8 Go : 0,00034 $/s, soit 1,22 $/h, contre environ 0,16 $/h). Pourquoi pas Inngest : son modèle par étapes, limité à environ 15 minutes par étape côté serverless, convient mal aux rendus FFmpeg longs. Il faudrait de toute façon Modal derrière.

Dans les deux options, **la source de vérité de l'état d'un job est la table Supabase `jobs`/`job_steps`**. C'est elle qu'alimentent l'admin et la progression en temps réel.

### 2.3 Transcription : **AssemblyAI** (recommandé), avec Deepgram derrière la même interface

| Critère | AssemblyAI | Deepgram |
|---|---|---|
| Modèle asynchrone haut de gamme | Universal-3.5 Pro : 0,21 $/h (0,0035 $/min), 18 langues | Nova-3 : 0,0043 $/min (monolingue), 0,0052 $/min (multilingue) |
| Modèle économique | Universal-2 : 0,15 $/h (0,0025 $/min), 99 langues | – |
| Horodatage au mot | Inclus | Inclus |
| Diarisation | +0,02 $/h | Option payante |
| Gratuit | 185 h de transcription asynchrone | Crédit de départ |
| Vitesse | Bonne | Très rapide |

Choix : **AssemblyAI**. Il est 20 à 40 % moins cher, son palier gratuit couvre toute la phase de développement, il inclut l'horodatage au mot et la ponctuation, et Universal-2 couvre 99 langues en repli. Le code passe par une interface `TranscriptionProvider`, ce qui permet de basculer vers Deepgram par variable d'environnement.

Sous-titres existants : pour une vidéo YouTube dont l'utilisateur est propriétaire et qui a connecté son compte (OAuth), l'API `captions.download` permet de récupérer ses sous-titres manuels. Les sous-titres automatiques ne sont pas fiables pour un découpage au mot. Règle : on n'utilise des sous-titres existants que s'ils sont manuels et horodatés au mot, ou alignables. Sinon, on transcrit.

### 2.4 Analyse des segments : API Claude

- Par défaut `claude-sonnet-5-5` (2 $ / 10 $ par million de jetons en entrée / sortie). Tâches légères (titres, hashtags, descriptions) : `claude-haiku-4-5` (1 $ / 5 $). Les deux sont configurables par variable d'environnement.
- Sortie JSON garantie par les **sorties structurées** (`output_config.format` avec un schéma JSON), puis validée côté serveur. Les règles métier (pas de chevauchement, bornes recalées sur les phrases, durée min/max) sont **appliquées dans le code** après la réponse du modèle, pas seulement demandées dans le prompt.
- Cache des prompts sur le prompt système et la transcription pour les régénérations.

### 2.5 Stockage

- **Cloudflare R2** pour les vidéos : pas de frais de sortie (essentiel pour la lecture et le téléchargement de vidéos), API S3, upload multipart résumable par URLs pré-signées, règles de cycle de vie pour supprimer les sources après X jours.
- **Supabase** pour toutes les métadonnées, sous RLS. Point de sécurité : la RLS ne protège pas R2. Les URLs signées R2 ne sont donc délivrées que par le serveur, **après** vérification de propriété dans Postgres, avec une courte durée de vie et des clés d'objet préfixées par l'identifiant de l'utilisateur.

---

## 3. Coût de revient estimé par minute de vidéo source

Hypothèse : vidéo de 30 min en français, 8 clips candidats, 5 clips rendus en 1080×1920.

| Poste | Calcul | Coût / min source |
|---|---|---|
| Transcription (Universal-3.5 Pro) | 0,21 $/h | 0,0035 $ |
| Claude Sonnet 5.5 (segments) | ≈ 15 k jetons en entrée (fenêtres qui se chevauchent) + ≈ 6 k en sortie (réflexion comprise) pour 30 min ≈ 0,09 $ | 0,003 $ |
| Claude Haiku 4.5 (métadonnées par plateforme) | ≈ 5 clips × 2 k jetons | 0,0003 $ |
| Calcul Modal | ≈ 10 min de 4 vCPU + 8 Go (téléchargement, MediaPipe, rendu x264) ≈ 0,03 $ | 0,001 $ |
| Stockage R2 | ≈ 2 Go pendant 7 jours à 0,015 $/Go/mois | < 0,0003 $ |
| **Total estimé** | | **≈ 0,008 à 0,012 $ / min** |

Ce chiffre sera **mesuré** en phase 1 : chaque job enregistre `cost_breakdown` (secondes de transcription, jetons Claude réels lus dans `usage`, secondes de calcul Modal, octets stockés).

---

## 4. Plans tarifaires proposés (configurables en base)

| Plan | Prix / mois | Minutes traitées | Durée max / vidéo | Fonctionnalités |
|---|---|---|---|---|
| Gratuit | 0 € | 30 | 20 min | Filigrane, export manuel uniquement |
| Créateur | 19 € | 300 | 90 min | Sans filigrane, publication YouTube et TikTok |
| Pro | 49 € | 1 000 | 3 h | + surveillance automatique de chaînes, planification, styles personnalisés |
| Studio | 129 € | 3 000 | 3 h | + 5 chaînes surveillées, file prioritaire |

Coût de revient maximal au plafond : Créateur ≈ 3 €, Pro ≈ 10 €, Studio ≈ 30 €. La marge brute reste au-dessus de 75 % avant les frais Stripe. Les minutes sont décomptées sur la durée de la **source** traitée, et réservées au lancement du job puis ajustées à la fin.

---

## 5. Durées de clips selon les plateformes

- YouTube Shorts : jusqu'à **3 minutes** pour un format vertical ou carré (depuis le 15/10/2024).
- TikTok : on garde 20 à 60 s par défaut. La limite de durée de la Content Posting API sera revérifiée en phase 6.
- Réglage utilisateur proposé : 15 s minimum, 180 s maximum, 20 à 60 s par défaut.

---

## 6. Comptes à créer

Ne collez aucune clé dans le chat. Chaque secret va directement dans les variables d'environnement de la plateforme concernée (Vercel, Modal, Trigger.dev) ou dans les secrets GitHub Actions.

| # | Service | Pour | Phase |
|---|---|---|---|
| 1 | GitHub (dépôt existant) | Code, CI, secrets Actions | 0 |
| 2 | Supabase : 2 projets (staging et prod) | Base, Auth, RLS, Realtime | 1-2 |
| 3 | Cloudflare : R2 + 1 bucket par environnement | Vidéos | 1 |
| 4 | Modal | Workers | 1 |
| 5 | Trigger.dev (si option A) | Orchestration | 1 |
| 6 | AssemblyAI | Transcription | 1 |
| 7 | Console Anthropic (clé API, limite de dépense) | Claude | 1 |
| 8 | Vercel | Frontend | 1 |
| 9 | Sentry | Erreurs (front et workers) | 2 |
| 10 | Resend (ou autre SMTP) | Emails d'authentification (le SMTP par défaut de Supabase est très limité) | 2 |
| 11 | Google Cloud : projet, écran de consentement OAuth, YouTube Data API v3 | Connexion Google, import, publication | 2 / 6 |
| 12 | Dropbox App Console | Import Dropbox | 3 |
| 13 | Stripe (mode test, puis live) | Abonnements | 5 |
| 14 | TikTok for Developers | Publication TikTok | 6 |
| 15 | Nom de domaine | Prod, et vérification OAuth Google et TikTok | 4-7 |
| 16 | (Optionnel, avec votre accord) fournisseur de proxy | Téléchargement YouTube | 3 |

Les variables correspondantes sont listées dans [`.env.example`](../.env.example).

---

## 7. Écarts avec le brief initial

1. **Publication YouTube : vérification obligatoire.** Toute vidéo envoyée par `videos.insert` depuis un projet API non audité (créé après le 28/07/2020) est **verrouillée en privé**. Il faut deux démarches Google : (a) la vérification de l'application OAuth, car le scope `youtube.upload` est sensible (domaine vérifié, politique de confidentialité, vidéo de démonstration), et (b) un **audit de conformité de l'API YouTube** (formulaire « Audit and Quota Extension »). Il faut compter plusieurs semaines : à lancer dès que la landing page et les pages légales sont en ligne.
2. **Quota d'upload YouTube.** Selon des sources tierces de 2026, `videos.insert` serait passé d'environ 1 600 à environ 100 unités le 04/12/2025, avec un quota d'upload séparé. Ce n'est **pas confirmé sur la page officielle** (accès bloqué depuis l'environnement) : à revérifier en phase 6.
3. **TikTok : application non auditée.** Les publications sont limitées à `SELF_ONLY` (privées), à 5 utilisateurs par 24 h, sur des comptes privés. Il faut d'abord la revue de l'application (quelques jours à 2 semaines, vidéo de démonstration du parcours complet), puis l'audit Content Posting API pour la visibilité publique. TikTok impose aussi des règles d'interface : l'utilisateur choisit lui-même la confidentialité (aucune valeur par défaut), on affiche les informations `creator_info`, et on demande la déclaration de contenu commercial.
4. **yt-dlp et conditions YouTube.** Au-delà du blocage des IP de datacenter, les conditions d'utilisation de YouTube encadrent le téléchargement, même par le propriétaire de la chaîne. La certification de propriété limite le risque mais ne l'efface pas. Je recommande l'upload direct comme voie principale, et l'URL YouTube comme option clairement libellée. Aucun proxy de contournement sans votre accord explicite (phase 3).
5. **Identifiant Haiku.** Le brief cite `claude-haiku-4-5-20251001`. L'identifiant courant documenté est l'alias `claude-haiku-4-5`. Les deux restent configurables via `CLAUDE_MODEL_LIGHT`.
6. **Claude Sonnet 5.5 : la réflexion ne se désactive pas.** `thinking: disabled` renvoie une erreur 400 sur ce modèle. On réglera l'effort (`low` ou `medium`), et le forçage d'outil (`tool_choice: any`) est remplacé par les sorties structurées.
7. **Trigger.dev est un SDK TypeScript.** Le code Python ne tourne que via une extension. C'est ce qui justifie la séparation orchestration TypeScript / calcul Python sur Modal.
8. **RLS et fichiers.** La RLS ne couvre que Postgres (et Supabase Storage). Les fichiers R2 sont protégés par des URLs signées émises après vérification serveur, et testés par des tests dédiés.

---

## 8. Sécurité multi-tenant : stratégie de tests (bloquante)

- RLS **activée et forcée** (`ENABLE` + `FORCE ROW LEVEL SECURITY`) sur toutes les tables du schéma `public`. Un test CI échoue si une table du schéma n'a pas de RLS ou n'a aucune politique.
- Tests pgTAP (`supabase test db`) : pour chaque table, l'utilisateur A ne peut ni lire, ni insérer, ni modifier, ni supprimer les lignes de B, et le rôle `anon` n'a accès à rien.
- Tests d'intégration en TypeScript avec deux vrais comptes via `supabase-js` et les routes API, y compris les URLs signées R2 : A ne peut pas obtenir d'URL pour un objet de B.
- La clé `service_role` n'est jamais exposée au navigateur (vérification automatique sur le bundle client).

---

## 9. Génération d'images

Aucun outil de génération d'images n'est disponible dans cet environnement. Conformément à vos instructions, en phase 4 je produirai **une maquette décrite en texte par section et par écran**, en suivant la structure de `imagegen-frontend-web` (ancrage de composition, mode d'arrière-plan, CTA, palette verrouillée), puis l'implémentation. Si vous pouvez connecter un outil de génération d'images d'ici là, je repasserai au flux « image d'abord ».

---

## 10. Questions à trancher

1. **File de tâches** : option A (Trigger.dev + Modal, recommandée) ou option B (Modal seul) ?
2. **Langues des vidéos sources** : uniquement le français, ou multilingue dès le lancement ? Cela détermine le choix entre Universal-3.5 Pro et Universal-2.
3. **Plans tarifaires** : validez-vous les valeurs de la section 4 (prix en euros, TVA gérée par Stripe Tax) ?
4. **Déploiement depuis l'environnement de développement** : le proxy réseau bloque plusieurs domaines fournisseurs. Je propose de déployer staging via GitHub Actions (secrets stockés dans GitHub, jamais dans le chat). Sinon, vous pouvez autoriser ces domaines dans les paramètres réseau de l'environnement.
