# AI Content Studio

A beginner-friendly Express app that turns a topic into an article, summary, social posts, image prompt, thumbnail, and narration. The Gemini key stays on the server.

## Run on Windows

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

Open http://localhost:3000. Put your Gemini API key in `.env` as `GEMINI_API_KEY=...`. Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Do not paste it into frontend code or commit `.env`.

## How it works

The browser uses `fetch('/api/generate', { method: 'POST', body: JSON.stringify(...) })`. Express parses that JSON, validates short strings, and calls `@google/genai` with a server-only key. Structured output asks Gemini for JSON matching a schema; the server parses and validates it before saving `content.json`, `article.md`, and `narration.txt` in `output/`.

The image route requests an image part from Gemini and decodes its base64 data into `thumbnail.png`. The audio route uses Gemini 3.8 Flash TTS and saves the SDK's complete WAV bytes as `narration.wav`; it does not mislabel raw PCM. The export route streams existing files through `archiver` into a ZIP, plus a README.

## Features and API routes

- `GET /api/health` checks server status and whether a key is configured.
- `POST /api/generate` accepts `topic`, `audience`, and `tone`.
- `POST /api/image` accepts `prompt`.
- `POST /api/audio` accepts `narration`, `voice`, and `style`.
- `POST /api/batch` accepts up to five `topics` and optionally `audience` and `tone`.
- `GET /api/export` downloads the current output ZIP.

Text, image, and TTS generation require API access. Availability, quotas, and billing depend on your Google AI account and selected models. Image and TTS models may not be enabled for every key; the UI reports those errors without crashing. The app has not been tested with a live key in this workspace, so live model access and quota behavior remain to be verified by you.

## Troubleshooting

If the page says the key is missing, check that `.env` is beside `server.js` and restart `npm run dev`. A 429 means quota/rate limiting. A model-access error means try a model available to your account or check the current Gemini model documentation. If a generated file is old, generate again; output files are intentionally ignored by Git.
