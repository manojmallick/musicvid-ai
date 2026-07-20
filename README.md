# MusicVid AI — Track 2: AI Showrunner

Autonomous music video director. Takes a song description, analyses lyrics/theme, plans shots, generates clips via Wan, and assembles a final manifest.

## Run

```bash
cd musicvid-ai
cp .env.example .env
npm install
npm run build
npm start
```

## Files

- `src/qwenClient.ts` — Qwen Cloud client
- `src/wanClient.ts` — Wan video generation adapter (simulation mode by default)
- `src/index.ts` — full 5-stage pipeline and demo

## Wan API

Set `WAN_API_KEY` and `WAN_BASE_URL` in `.env` to call a real Wan endpoint. Without them, the adapter writes prompt placeholders so the rest of the pipeline still runs.
