# Phase 1 : cœur de traitement

Statut : **code terminé et testé localement. Déploiement du staging en attente de vos comptes et secrets.**

Objectif de la phase : vous envoyez un MP4 depuis le navigateur, le système produit 3 clips téléchargeables, le JSON des segments et le coût réel du traitement.

## 1. Ce qui est construit

| Brique | Emplacement | Rôle |
|---|---|---|
| Workers Python | `workers/clipper/` | Préparation, transcription, sélection des segments, recadrage, sous-titres, rendu, comptabilité des coûts |
| App Modal | `workers/modal_app.py` | Une fonction par étape et une API HTTP authentifiée pour les démarrer et suivre leur état |
| Orchestration | `apps/web/src/trigger/process-video.ts`, `apps/web/src/lib/orchestrator.ts` | Enchaîne les étapes, réessaie, reprend après erreur, met à jour la progression |
| App web (staging) | `apps/web/` | Upload multipart direct vers R2, page de suivi, clips, JSON, coût |
| Base de données | `supabase/migrations/` | Tables `jobs`, `job_steps`, `transcripts`, `segments`, `clips`, `cost_events` |
| Tests RLS | `supabase/tests/` | Couverture RLS et isolation entre utilisateurs |
| CI et déploiement | `.github/workflows/` | `ci.yml` (tests) et `deploy-staging.yml` (Supabase, R2, Modal, Trigger.dev, Vercel) |

### Pipeline

1. **Préparation** : téléchargement depuis R2, contrôle (vidéo lisible, piste audio, durée maximale), extraction d'un audio mono 16 kHz.
2. **Transcription** : AssemblyAI avec horodatage au mot, détection de langue limitée au français et à l'anglais.
3. **Sélection** : la transcription est découpée en phrases, puis en fenêtres de 8 minutes qui se chevauchent d'une minute. Claude (`claude-sonnet-5-5`, sortie JSON imposée par schéma) propose des candidats. Le code applique ensuite les règles :
   - bornes recalées sur des débuts et fins de phrases ;
   - durée comprise entre 20 et 60 s ;
   - rejet des ouvertures du type « comme je disais » ;
   - fin sur une phrase complète ;
   - aucun chevauchement entre segments.
4. **Rendu** : détection de visage MediaPipe sur 4 images par seconde, avec lissage (médiane, zone morte, amorti). Sans visage fiable, le clip passe en repli fond flouté. Sortie en 1080×1920, H.264 + AAC, son normalisé à -14 LUFS. Sous-titres mot par mot en 3 styles, accroche en haut, zones de sécurité TikTok respectées.

### Reprise après erreur

- Chaque étape est **idempotente** et son résultat est enregistré dans `job_steps`.
- Une erreur technique est réessayée jusqu'à 3 fois, avec un délai croissant.
- Si l'exécution Trigger.dev elle-même échoue, elle est relancée et **reprend après la dernière étape réussie**.
- Une erreur attendue (vidéo trop longue, pas de parole, aucun passage valable) arrête le job avec un **code stable**, traduit en français et en anglais dans l'interface.
- Tout échec final est visible dans `jobs.status = 'failed'`. L'admin les affichera en phase 2.

### Coûts

Chaque tentative enregistre ses lignes de coût dans `cost_events` :
- AssemblyAI : durée audio ;
- Claude : jetons réels lus dans `usage`, cache compris ;
- Modal : durée × ressources réservées ;
- R2 : stockage.

`jobs.cost_usd` est tenu à jour par un trigger. La page du job affiche le total, la répartition par fournisseur et le **coût par minute de vidéo source**. Les prix unitaires sont configurables (`PRICE_*`).

## 2. Résultats des vérifications locales

| Vérification | Résultat |
|---|---|
| Tests Python : règles de segments, sous-titres, lissage, rendu FFmpeg réel des 3 styles en mode suivi et en mode flou, pipeline complet avec faux services | **21/21** |
| Tests web : orchestration (reprise, réessais, erreur définitive), découpage multipart, authentification staging, coûts | **11/11** |
| Tests pgTAP sur Postgres local : RLS activée et forcée partout, A ne voit ni ne modifie rien de B, `anon` n'accède à rien | **23/23** |
| `tsc`, ESLint, `ruff`, `next build` | OK |
| Scan du bundle client à la recherche de noms de secrets | aucun |

Captures : `docs/phase-1/caption-styles.png` (3 styles de sous-titres sur une vidéo de test) et `docs/phase-1/staging-upload.png` (page d'upload).

**Non vérifié à ce stade**, faute de comptes et de clés :
- appels réels à AssemblyAI et Claude ;
- déploiement Modal, Trigger.dev et Vercel ;
- détection de visage sur une vraie personne : le modèle tourne, mais les vidéos de test n'ont pas de visage.

Ce sera fait au premier déploiement du staging, avec votre MP4.

## 3. Ce que je vous demande

Aucune clé ne passe par le chat. Tout se saisit dans les interfaces des plateformes.

### 3.1 Créer les comptes et ressources

1. **Supabase** : un projet « clips-staging ». Notez sa référence de projet (dans l'URL du tableau de bord).
2. **Cloudflare R2** : un bucket « clips-staging » et un jeton API R2 avec les droits *Admin Read & Write* sur ce bucket. Ces droits sont nécessaires pour appliquer CORS et le cycle de vie ; je les restreindrai en phase 7.
3. **Modal** : un environnement « staging » et un jeton (`modal token new` en local, ou via le tableau de bord).
4. **Trigger.dev** : un projet. Si l'environnement « staging » n'est pas inclus dans votre offre, créez un projet dédié « clips-staging » et utilisez son environnement « prod » (variable `TRIGGER_DEPLOY_ENV=prod`).
5. **AssemblyAI** et **console Anthropic** : une clé API chacun. Je conseille une limite de dépense mensuelle sur la console Anthropic.
6. **Vercel** : un projet « clips-staging » importé depuis ce dépôt, avec **Root Directory = `apps/web`**.

### 3.2 Renseigner GitHub (Settings > Environments > créer « staging »)

| Type | Nom | Valeur |
|---|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN` | Jeton personnel Supabase (Account > Access Tokens) |
| Secret | `SUPABASE_DB_PASSWORD` | Mot de passe de la base du projet |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` du projet |
| Secret | `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
| Secret | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Jeton R2 |
| Secret | `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` | Jeton Modal |
| Secret | `ASSEMBLYAI_API_KEY` | Clé AssemblyAI |
| Secret | `ANTHROPIC_API_KEY` | Clé Anthropic |
| Secret | `WORKER_SHARED_SECRET` | À générer sur votre machine : `openssl rand -hex 32` |
| Secret | `TRIGGER_ACCESS_TOKEN` | Jeton personnel Trigger.dev |
| Secret | `VERCEL_TOKEN` | Jeton Vercel |
| Variable | `SUPABASE_PROJECT_REF` | Référence du projet |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| Variable | `R2_BUCKET` | `clips-staging` |
| Variable | `NEXT_PUBLIC_APP_URL` | URL du staging, par exemple `https://clips-staging.vercel.app` |
| Variable | `TRIGGER_PROJECT_REF` | `proj_...` |
| Variable | `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Settings du projet Vercel |
| Variable (optionnelle) | `MODAL_ENVIRONMENT`, `TRIGGER_DEPLOY_ENV`, `CLAUDE_EFFORT`, `MAX_SOURCE_MINUTES`, `CLIPS_TO_RENDER` | Voir `.env.example` |

### 3.3 Renseigner les variables du projet Vercel (environnement Production du projet staging)

`APP_ENV=staging`, `STAGING_BASIC_AUTH` (identifiant:mot de passe de votre choix), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TRIGGER_SECRET_KEY` (clé de l'environnement Trigger.dev ciblé).

### 3.4 Lancer

Fusionnez la branche dans `main`, ou lancez « Deploy staging » à la main dans l'onglet Actions. Le workflow :
1. applique les migrations ;
2. configure le bucket ;
3. synchronise les secrets vers Modal et déploie les workers (avec un contrôle de santé) ;
4. déploie l'orchestrateur ;
5. publie le site.

Une fois le workflow terminé, envoyez-moi l'URL du run. J'analyserai les logs, je ferai le test avec votre MP4 et je vous rapporterai les 3 clips, le JSON et le coût mesuré.

## 4. Points à confirmer pendant le premier vrai traitement

- **Identifiant AssemblyAI** du modèle Universal-3.5 Pro : la valeur par défaut `universal` est l'identifiant documenté dans le SDK installé. Il se change sans toucher au code, via `ASSEMBLYAI_SPEECH_MODELS`.
- **Qualité du recadrage** sur des plans larges : le modèle MediaPipe « short range » est conçu pour des visages proches. Si le taux de détection est trop faible sur vos vidéos, je proposerai deux options.
- **Coût réel par minute** : comparaison avec l'estimation de la phase 0, entre 0,008 et 0,012 $.

## 5. Laissé pour les phases suivantes (volontairement)

- Comptes utilisateurs, ownership réel et table dédiée aux déclarations de droits : phase 2. En phase 1, la déclaration est déjà obligatoire et horodatée dans `jobs.options`.
- Progression en temps réel via Supabase Realtime : phase 2. La page interroge l'API toutes les 3 s en attendant.
- Titres, descriptions et hashtags par plateforme (Claude Haiku) : génération des métadonnées avec la revue des clips.
- Reprise d'un upload interrompu après fermeture de l'onglet : phase 3. Les parties échouées sont déjà réessayées.
- Identité visuelle et interface définitive : phase 4.
