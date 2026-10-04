# Phase 4 : identité, landing page et application complète

Statut : **terminée et testée en local**, avec les limites décrites en section 4. En attente de votre validation.

## 1. Identité

Nom de travail : **Pépite**, accroche « Les meilleurs moments, prêts à poster. » Détails et justification dans [`design/marque.md`](design/marque.md), maquettes textuelles dans [`design/maquettes.md`](design/maquettes.md) (pas de génération d'images disponible ici, d'où des maquettes en texte).

- Une seule couleur d'accent : l'or (`#F5B000`), sur un noir chaud et un blanc cassé. Mode sombre automatique selon le système.
- Typographies : Bricolage Grotesque (titres), Geist (texte), Geist Mono (scores, durées).
- Logo : un cadre vertical 9:16 avec une facette dorée.
- Le nom n'a pas été vérifié auprès de l'INPI ni pour la disponibilité du domaine : à faire avant le lancement.

## 2. Écrans

| Écran | Contenu |
|---|---|
| **Landing** `/` | Accroche, aperçu de téléphone animé, avant/après (vidéo longue vers 3 clips), 3 étapes, fonctionnalités, explication du score, tarifs lus depuis la base, FAQ, appel à l'action. |
| **Connexion / inscription** | Restylées, même logique qu'en phase 2. |
| **Tableau de bord** `/app` | Premier lancement : deux grandes actions (envoyer un fichier, coller un lien) et les 3 étapes. Ensuite : clips à relire, minutes restantes, quota, vidéos détectées, vidéos en cours. |
| **Vidéo** `/app/jobs/[id]` | Progression en direct, frise des passages repérés (plus l'or est intense, meilleur est le score), clips, transcription avec passages surlignés. |
| **Revue d'un clip** `/app/clips/[id]` | Lecteur, Valider / Rejeter / Remettre à relire, score et ses 4 critères avec la justification, découpe (début et fin, recalés sur les mots), choix du style avec aperçu, accroche, **Régénérer**, textes de publication YouTube et TikTok avec bouton Copier. Le clip se met à jour tout seul à la fin du nouveau rendu. |
| **Bibliothèque** `/app/library` | Tous les clips, filtres par statut et par style (dans l'URL, donc partageables), sélection multiple et téléchargement groupé. |
| **Compte** `/app/account` | Nom, style et accroche par défaut (préremplis à chaque nouvelle vidéo), plan et consommation, connexions YouTube et TikTok (« Bientôt », phase 6), déconnexion. |

**Nouveau côté traitement** :
- titres, descriptions, légendes et hashtags proposés pour chaque clip, par le modèle léger (Haiku 4.5), en une seule requête par vidéo. Coût estimé : moins de 0,002 $ par vidéo. Si cette étape échoue, la vidéo est quand même livrée, sans textes ;
- régénération d'un clip : limitée à 40 rendus par vidéo, impossible après la suppression de la source (7 jours), durée de 5 s à 3 min. Un clip régénéré repasse en « À relire », même s'il était validé : c'est une nouvelle version ;
- correction d'un défaut trouvé pendant les tests : deux passages consécutifs se chevauchaient de quelques centièmes de seconde à cause des marges de début et de fin, et le second était écarté. Ils sont maintenant gardés tous les deux (test ajouté).

## 3. Preuves

| Vérification | Résultat |
|---|---|
| Tests workers (dont métadonnées, re-rendu d'un clip, passages consécutifs) | **43/43** |
| Tests web (dont recalage des bornes sur les mots, parité des traductions FR/EN, absence de tirets cadratins) | **30/30** |
| Tests base de données (le statut d'un clip et les bornes d'un passage ne sont modifiables que via l'API, jamais directement ; préférences par défaut modifiables par l'utilisateur, styles inconnus refusés) | **60/60** |
| Isolation entre 2 vrais comptes (un compte ne voit ni ne modifie les vidéos, clips, passages, chaînes d'un autre) | **16/16** |
| Typecheck, lint, build de production | OK |
| Parcours complet dans un navigateur (détail ci-dessous) | OK |

Parcours navigateur, avec les faux modèles locaux (aucune clé) :
- compte : style « Épuré » sans accroche enregistré, puis retrouvé par défaut sur « Nouvelle vidéo » ;
- upload d'une vidéo de 3 min 17 : 3 clips, avec textes YouTube et TikTok ;
- clip 1 validé, puis fin raccourcie de 3 s **au clavier**, style changé, régénéré : le message de rendu apparaît, puis la nouvelle version remplace l'ancienne sans recharger la page ;
- clip 3 rejeté ;
- bibliothèque : 3 clips, filtre « Validé » correct, 2 clips sélectionnés puis téléchargés l'un après l'autre ;
- mobile (390 px) : pas de défilement horizontal, compte accessible depuis l'icône en haut à droite ;
- clavier : le premier arrêt de tabulation est « Aller au contenu ».

Captures dans `docs/phase-4/` : `landing`, `landing-dark`, `landing-mobile`, `onboarding`, `dashboard`, `video`, `review`, `review-after`, `review-dark`, `review-mobile`, `library`, `library-dark`, `library-mobile`, `account`, `account-mobile`.
Dans ce bac à sable, les photos de la landing (service d'images d'exemple) sont bloquées par le réseau : on voit le dégradé de secours. Elles seront à remplacer par vos propres visuels.

## 4. Audit d'interface (Web Interface Guidelines de Vercel)

Corrigé pendant l'audit :
- lien d'évitement « Aller au contenu » et zone principale identifiée sur toutes les pages ;
- contour de focus : l'or sur fond clair n'était pas assez contrasté (environ 1,9:1), il est maintenant noir en mode clair et or en mode sombre ;
- choix du style au clavier : le contour de focus est visible sur la carte ;
- curseurs de découpe : la valeur est annoncée en minutes et secondes aux lecteurs d'écran ;
- avertissement si l'on quitte la revue avec une découpe non régénérée ;
- confirmation avant de retirer une chaîne ;
- dates au format `Intl`, avec un fuseau fixe (Europe/Paris) pour un rendu identique serveur et navigateur ;
- nombres à la française (« 22,6 s », « 3,3 / 30 min »), sans retour à la ligne entre le nombre et l'unité ;
- couleur du navigateur mobile accordée au thème, animations coupées si « réduire les animations » est activé ;
- dimensions explicites sur les vignettes, chargement différé ;
- libellé « Enregistrement… » pendant la sauvegarde.

Restant, volontairement :
- **textes de la landing en dur** dans `apps/web/src/app/page.tsx`. Tous les textes de l'application sont dans le catalogue FR/EN (`i18n/messages.ts`, parité vérifiée par un test). La landing anglaise demande une vraie adaptation marketing, pas une traduction mot à mot : je propose de la faire quand vous ouvrirez l'anglais ;
- l'interface affiche toujours le français : la sélection de langue arrivera avec la landing anglaise ;
- les titres ne sont pas en « Title Case » : c'est une règle anglaise, pas française.

## 5. Ce qu'il faut de votre côté

Rien de bloquant pour valider. Pour la suite :
- dire si le nom « Pépite » vous convient (sinon le changement tient en un fichier : `apps/web/src/lib/brand.ts`, plus le logo) ;
- fournir ou choisir les visuels de la landing ;
- phase 5 : un compte Stripe (mode test suffit au début).
