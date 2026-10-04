# Faire tourner le produit en local (sans abonnement)

Ce mode sert à tester à petite échelle sur votre propre machine. Il n'y a aucun abonnement à souscrire.

| Brique en production | Équivalent local | Coût |
|---|---|---|
| Supabase (cloud) | Supabase local (Docker) | 0 |
| Cloudflare R2 | SeaweedFS, stockage compatible S3 (Docker) | 0 |
| Modal | Worker local (Docker) | 0 |
| Trigger.dev | Orchestrateur intégré au serveur web | 0 |
| AssemblyAI | Whisper en local (faster-whisper), AssemblyAI en option | 0 |
| Vercel | `npm run dev` sur votre machine | 0 |
| Claude (sélection des passages) | API Anthropic | **Paiement à l'usage**, environ 1 centime par vidéo de 10 min |

Seule la clé API Anthropic est payante. Elle fonctionne sur crédits prépayés, sans abonnement. Pour un tout premier test, vous pouvez aussi vous en passer : voir l'étape 3.

## 1. Prérequis (une seule fois)

- **Docker Desktop**, démarré : <https://docs.docker.com/get-docker/>. Prévoyez environ 8 Go de RAM disponibles pour Docker.
- **Node.js 20 ou plus** : <https://nodejs.org>.
- **Windows** : utilisez WSL2 (Ubuntu) et lancez les commandes depuis le terminal WSL.
- Le premier lancement télécharge plusieurs Go : les images Docker, puis le modèle Whisper au premier traitement.

## 2. Lancer

```bash
git clone https://github.com/lakruppance/Test-claude.git
cd Test-claude
git checkout claude/amazing-goodall-a0p12v   # tant que la PR n'est pas fusionnée
scripts/local-up.sh
```

Le script :
1. démarre Supabase et applique les migrations ;
2. génère vos fichiers `.env.local` ;
3. démarre le stockage et le worker ;
4. lance le site sur **http://localhost:3000**.

Pour tout arrêter : `scripts/local-down.sh`. Vos données sont conservées. Ajoutez `--wipe` pour tout effacer.

## 3. Créer votre compte

Sur http://localhost:3000, créez un compte. L'email de confirmation n'est pas réellement envoyé : il arrive dans la boîte locale, sur http://localhost:54324. Pour accéder à l'admin : `node scripts/make-admin.mjs votre@email`.

## 3 bis. Ajouter votre clé Claude

Au premier lancement, le script crée le fichier `.env.local` à la racine. Ouvrez-le dans un éditeur et complétez :

```
ANTHROPIC_API_KEY=...        # votre clé, à créer sur console.anthropic.com
```

Puis relancez `scripts/local-up.sh`. Vos valeurs sont conservées d'un lancement à l'autre. Ce fichier n'est jamais versionné : ne le partagez pas, et ne collez pas votre clé dans un chat.

**Test sans aucune clé** : mettez `SEGMENTS_PROVIDER=fake`. Les passages sont alors choisis par simple durée, et non par l'IA. Cela sert uniquement à vérifier que toute la chaîne fonctionne.

## 4. Réglages utiles dans `.env.local`

| Variable | Effet |
|---|---|
| `TRANSCRIPTION_PROVIDER=whisper` | Transcription locale gratuite, par défaut |
| `WHISPER_MODEL=small` | `base` (plus rapide), `small` (bon compromis), `medium` (plus précis, plus lent) |
| `TRANSCRIPTION_PROVIDER=assemblyai` + `ASSEMBLYAI_API_KEY` | Transcription plus précise. Le compte gratuit inclut 185 h |
| `CLIPS_TO_RENDER=3` | Nombre de clips rendus par vidéo |
| `MAX_SOURCE_MINUTES=30` | Durée maximale acceptée en local |
| `LOCAL_WORKER_THREADS=2` | Nombre de rendus en parallèle (selon votre processeur) |

## 5. Ce qu'il faut savoir

- **Temps de traitement** : tout tourne sur votre processeur. Pour une vidéo de 10 min, comptez quelques minutes pour Whisper et 1 à 2 minutes par clip.
- **Coût affiché** :
  - le calcul et le stockage sont à 0 $ (« local ») ;
  - le détail technique indique leur équivalent cloud ;
  - le coût Claude affiché est réel.
- **Qualité** : Whisper `small` est moins précis qu'AssemblyAI sur un son bruité. Le découpage au mot reste correct sur une voix claire.
- **Pas pour la production** : l'orchestrateur local tourne dans le serveur web et suppose une seule machine. Le staging et la production utilisent Trigger.dev et Modal, avec le même code de pipeline.

## 6. En cas de problème

| Symptôme | Action |
|---|---|
| « Docker is installed but not running » | Démarrez Docker Desktop |
| Le worker ne démarre pas | `docker compose logs worker` |
| Le traitement échoue à « Sélection des passages » avec un message de clé | Complétez `ANTHROPIC_API_KEY` dans `.env.local`, puis relancez |
| Ports déjà utilisés (3000, 8333, 8787, 54321, 54324) | Fermez l'application qui les occupe |
