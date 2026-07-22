# marketing-render

Code-rendered marketing visuals for DriverTrack (and later Revive! Barnsley).
React-style components plus brand tokens, rendered to PNG by headless Chromium.
No design canvas, no per-template manual step. New template = new component.

## What it does

- `POST /render` takes a template name, format and data, returns a finished PNG.
- Optionally uploads the result to Cloudflare R2 and returns a public URL.
- Fonts are embedded, output is identical on any machine, sRGB, 2x for crispness.

## Quick deploy to Railway

1. Push this repo to GitHub.
2. In Railway: New Project, Deploy from GitHub repo, pick this repo.
   Railway reads the Dockerfile automatically.
3. Set environment variables (Railway, Variables tab). See `.env.example`.
   For a first deploy you only strictly need none: the service renders and returns
   PNGs without R2. Add the R2 vars when you want uploaded URLs and the logo.
4. Deploy. Railway gives you a public URL. Hit `GET /<url>/health` to confirm.

## Environment variables

| Var | Needed for | Notes |
|---|---|---|
| `RENDER_API_KEY` | Optional | If set, callers must send `x-api-key`. Leave blank to keep open. |
| `ASSET_BASE` | Logo on renders | Public R2 base, e.g. `https://assets.drivertrack.co`. Logos load from here. |
| `R2_ACCOUNT_ID` | Upload to R2 | Cloudflare account id. |
| `R2_ACCESS_KEY_ID` | Upload to R2 | R2 API token access key. |
| `R2_SECRET_ACCESS_KEY` | Upload to R2 | R2 API token secret. |
| `R2_BUCKET` | Upload to R2 | Bucket name. |
| `R2_PUBLIC_BASE` | Upload to R2 | Public URL base for the bucket. Usually same as `ASSET_BASE`. |

## API

### `GET /health`
Returns `{ ok: true, templates: [...] }`.

### `POST /render`
Body:
```json
{
  "template": "dt-pipeline-hero",
  "format": "square",
  "data": {
    "headline": "Screen 40 drivers overnight. Start Monday full.",
    "support": "DriverTrack calls, screens and sorts every applicant overnight.",
    "cta": "Book a 15 minute demo",
    "heroImage": "https://assets.drivertrack.co/shots/laptop-pipeline.png"
  },
  "upload": false,
  "filename": "optional-name.png"
}
```
- `upload: false` (default) streams the PNG back directly.
- `upload: true` uploads to R2 and returns `{ ok, url, width, height, bytes }`.
- Omit any `data` field to use the template default.

## Local use

```bash
npm install
npm run render dt-pipeline-hero square   # writes out/dt-pipeline-hero-square.png
npm start                                # runs the HTTP service on :3000
```

## Adding a template

1. Copy `src/templates/dt-pipeline-hero.js` as a starting point.
2. Build the layout, pulling every colour and size from `src/tokens/drivertrack.js`.
3. Register it in `src/templates/index.js`.
That is the whole process. No canvas.

## Structure

```
src/
  tokens/        brand tokens (single source of truth)
  templates/     one file per template + index registry
  lib/
    render.js    Chromium render engine, font embedding
    r2.js        Cloudflare R2 upload
  server.js      HTTP service (deploy entry point)
scripts/
  render.js      local CLI render to out/
assets/fonts/    Inter weights, embedded at render time
```

## Notes

- Second brand (Revive! Barnsley) drops in as `src/tokens/revive.js` plus its own
  templates. The engine and server are shared.
- DriverTrack renders default to square (1080x1080). Other formats exist in the
  token file if needed.
