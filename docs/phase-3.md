# Phase 3 : ingestion complète

Statut : **terminée et testée en local**, avec les limites décrites en section 3. En attente de votre validation.

## 1. Ce qui est en place

| Source | Fonctionnement |
|---|---|
| **Fichier** (existait) | Upload direct vers le stockage, en plusieurs parties envoyées en parallèle. **Nouveau : reprise.** Si l'onglet est fermé ou si le réseau coupe, il suffit de choisir à nouveau le même fichier : seules les parties manquantes sont renvoyées. |
| **Lien Google Drive** | Fichier partagé avec « toute personne disposant du lien ». Le serveur le télécharge et récupère son vrai nom. S'il n'est pas partagé, un message explique comment le partager. |
| **Lien Dropbox** | Lien de partage standard, même fonctionnement que Drive. |
| **URL YouTube** | Téléchargement côté serveur avec yt-dlp, en 1080p maximum. La durée est vérifiée **avant** le téléchargement (limite du plan). Les blocages sont détectés et traduits en messages clairs : contrôle anti-robot, 403 ou 429, vidéo privée, réservée aux membres, avec limite d'âge, en direct ou indisponible. Un bouton « Envoyer le fichier directement » est alors proposé. |
| **Surveillance de chaînes** | Via le **flux RSS public** de la chaîne, donc sans clé ni quota d'API. Ajout d'une chaîne par son URL `/@nom`, son URL `/channel/UC…` ou son identifiant. Une déclaration de droits est demandée pour la chaîne. Les vidéos déjà publiées sont ignorées : seules celles publiées **après** l'ajout sont signalées, sur la page Chaînes et sur le tableau de bord. « Générer les clips » d'un clic, ou traitement **automatique** (option). Les quotas s'appliquent dans les deux cas. |

**Plans** : la surveillance de chaînes est réservée à Pro (1 chaîne) et Studio (5 chaînes). Vérification toutes les 30 min par défaut (`RSS_POLL_INTERVAL_MINUTES`), via une tâche planifiée Trigger.dev en production et une boucle locale en mode local. Le bouton « Vérifier maintenant » est utilisable une fois toutes les 2 minutes.

**Sécurité** :
- les nouvelles tables (`channels`, `channel_videos`) ont la RLS activée et forcée ;
- elles ne s'écrivent que côté serveur, après vérification que l'élément appartient bien à l'utilisateur ;
- chaque import (lien ou chaîne) crée une déclaration de droits horodatée.

## 2. Preuves

| Vérification | Résultat |
|---|---|
| Tests workers : réécriture des liens, téléchargement (succès, page HTML au lieu du fichier, 403, fichier trop gros), classification des erreurs YouTube, durée maximale, proxy utilisé uniquement s'il est configuré | **40/40** |
| Tests web : détection des liens, lecture du flux RSS, résolution de chaîne, orchestration avec l'étape de téléchargement | **25/25** |
| Isolation entre 2 vrais comptes via l'API, étendue aux tables de chaînes | **16/16** |
| Tests base de données | **55/55** |
| Parcours complet dans un navigateur (détail ci-dessous) | OK |

Détail du parcours navigateur :
- un lien Drive va jusqu'au clip ;
- un lien non pris en charge affiche un message clair ;
- un lien YouTube bloqué affiche le message de blocage et le bouton d'upload ;
- une chaîne est ajoutée, son historique est ignoré, une nouvelle vidéo est détectée et apparaît sur le tableau de bord ;
- un upload est coupé puis repris : seule la partie manquante est renvoyée, et le traitement va au bout.

Captures dans `docs/phase-3/` :
- `import-drive.png`
- `youtube-bloque.png`
- `chaines.png`

## 3. Limites de ces tests

Mon environnement de développement **n'a pas accès** à YouTube, Google Drive ni Dropbox. J'ai donc :
- simulé Drive et le flux RSS avec un serveur local qui renvoie les mêmes réponses (fichier, en-têtes, flux au format YouTube) ;
- testé le **cas bloqué** de YouTube pour de vrai. Mon environnement est refusé comme le serait un datacenter, et le message correct s'affiche bien. Je n'ai en revanche pas pu tester un téléchargement YouTube **réussi**.

À vérifier sur votre machine en local, et sur le staging :
- un vrai lien Drive ;
- un vrai lien Dropbox ;
- une vraie URL YouTube ;
- une vraie chaîne.

## 4. Points d'attention

- **YouTube depuis un serveur** : il est très probable que YouTube bloque une partie des téléchargements depuis Modal (adresses de datacenter). Le produit le gère proprement, avec un message et un repli sur l'upload. Pour un meilleur taux de réussite, deux options :
  - **A. Accepter le repli** : rien à faire. Simple et sans risque juridique supplémentaire, mais une partie des imports YouTube passera par l'upload.
  - **B. Configurer un proxy résidentiel** (`YTDLP_PROXY_URL`, secret GitHub) : meilleur taux de réussite, mais cela coûte de l'argent et revient à contourner une restriction de YouTube. **Je ne l'active pas sans votre accord explicite.** Aucun autre contournement n'est en place : pas de cookies, ni de jetons d'identification, ni d'usurpation de navigateur.
- **Conditions d'utilisation de YouTube** : elles encadrent le téléchargement. La déclaration de droits est enregistrée à chaque import. C'est un point à faire valider dans les CGU (phase 7).
- **Résolution des noms `@chaîne`** : il faut lire la page YouTube, qui peut aussi être bloquée depuis un serveur. Dans ce cas, l'utilisateur est invité à coller l'URL `/channel/UC…`. La surveillance elle-même, par le flux RSS, est en général bien tolérée.
- **Notifications par email** des nouvelles vidéos : pour l'instant, elles ne s'affichent que dans l'application. L'envoi par email viendra avec le service d'emails (Resend) en phase 7, sauf si vous le voulez plus tôt.
