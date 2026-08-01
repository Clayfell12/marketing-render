# marketing-render

Code-rendered marketing visuals for DriverTrack and Revive! Barnsley.
Brand tokens plus HTML/CSS components, rendered to PNG by headless Chromium.
No design canvas, no per-template manual step. New template = new component.

## What it does

- `POST /render` takes a template name, format and data, returns a finished PNG.
- Optionally uploads the result to Cloudflare R2 and returns a public URL.
- Fonts are embedded, output is identical on any machine, sRGB, 2x for crispness.

## Deploy to Railway

1. Push this repo to GitHub.
2. Railway: New Project, Deploy from GitHub repo. It reads the Dockerfile.
3. Set environment variables (see `.env.example`). None are strictly required to
   render, but `ASSET_BASE` is needed for logos and the R2 vars for uploads.
4. Settings, Networking, Generate Domain. Port 3000.
5. Check `GET /health`.

## Environment variables

| Var | Needed for | Notes |
|---|---|---|
| `RENDER_API_KEY` | Optional | If set, callers must send `x-api-key`. |
| `ASSET_BASE` | Logos on renders | Public R2 base, e.g. `https://pub-xxxx.r2.dev` |
| `R2_ACCOUNT_ID` | Upload to R2 | Cloudflare account id. |
| `R2_ACCESS_KEY_ID` | Upload to R2 | R2 API token access key. |
| `R2_SECRET_ACCESS_KEY` | Upload to R2 | R2 API token secret. |
| `R2_BUCKET` | Upload to R2 | Bucket name. |
| `R2_PUBLIC_BASE` | Upload to R2 | Usually same as `ASSET_BASE`. |

## Mobile app

Open the service's root URL on your phone (`https://your-app.up.railway.app/`).
Pick a brand, pick a template, edit the copy, hit Render. Save to camera roll or
push straight into the LinkedIn share sheet.

Add it to your home screen (Safari: Share, then Add to Home Screen) and it runs
full screen with its own icon like a native app.

New templates appear in the app automatically as soon as they are registered,
because each template exports a field schema the app reads at load.

## API

### `GET /health`
Returns `{ ok: true, templates: [...] }`.

### `POST /render`
```json
{
  "template": "dt-first-to-driver",
  "format": "square",
  "data": { "headline": "...", "cta": "..." },
  "upload": false,
  "filename": "optional-name.png"
}
```
- `upload: false` (default) streams the PNG back.
- `upload: true` uploads to R2 and returns `{ ok, url, width, height, bytes }`.
- Omit any `data` field to use the template default.

## Templates

| Key | Brand | Default size | Purpose |
|---|---|---|---|
| `dt-pipeline-hero` | DriverTrack | 1200x1200 | Product hero with callbacks queue and a hero image zone |
| `dt-first-to-driver` | DriverTrack | 1200x1200 | Speed-to-contact race: one applicant, four DSPs, who replied first |

DriverTrack renders default to square (1200x1200).
Revive! tokens are in place (`src/tokens/revive.js`); templates to follow.

## Local use

```bash
npm install
npm run render dt-first-to-driver square   # writes out/
npm start                                  # HTTP service on :3000
```

Set `ASSET_BASE` locally if you want logos to load:
```bash
ASSET_BASE="https://pub-xxxx.r2.dev" npm run render dt-first-to-driver square
```

## Adding a template

1. Copy an existing file in `src/templates/` as a starting point.
2. Build the layout, pulling every colour and size from the brand token file.
3. Register it in `src/templates/index.js`.

## Structure

```
src/
  tokens/        brand tokens (single source of truth)
    drivertrack.js
    revive.js
  templates/     one file per template + index registry
  lib/
    render.js    Chromium render engine, font embedding
    r2.js        Cloudflare R2 upload
  server.js      HTTP service (deploy entry point)
  assets/fonts/  Inter weights, embedded at render time
scripts/
  render.js      local CLI render to out/
```

## Notes

- Fira Sans weights need adding to `src/assets/fonts/` before building Revive templates.
- Brand rules live in the token files as comments. Read them before designing.
