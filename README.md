# Clips SaaS (nom provisoire)

SaaS qui génère des clips verticaux sous-titrés à partir de vidéos longues (upload, Drive/Dropbox, YouTube).

État : **phase 1, cœur de traitement** (voir [`docs/phase-1.md`](docs/phase-1.md)). Voir [`docs/phase-0.md`](docs/phase-0.md) pour les choix techniques, les coûts estimés et les comptes à créer, et [`.env.example`](.env.example) pour les variables d'environnement.

## Structure

- `apps/web` : Next.js (interface, API, tâches Trigger.dev)
- `workers` : pipeline Python (FFmpeg, MediaPipe, AssemblyAI, Claude) déployé sur Modal
- `supabase` : migrations et tests RLS (pgTAP)
- `.github/workflows` : CI et déploiement du staging

## Tests en local

```bash
# Workers
cd workers && uv venv -p 3.11 && uv pip install -e ".[dev]" && ../scripts/fetch_assets.sh && uv run pytest
# Web
cd apps/web && npm ci && npx next typegen && npm test && npm run build
# RLS (Docker requis)
npx supabase@2.119.0 db start && npx supabase@2.119.0 test db
```
