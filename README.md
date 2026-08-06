# marketing-render

Code-rendered marketing visuals for DriverTrack and Revive! Barnsley.
Brand tokens plus HTML/CSS components, rendered to PNG by headless Chromium.
No design canvas, no manual step. A graphic is the locked shell plus one or two blocks.

## What it does

- `POST /render` takes a composed spec, returns a finished PNG.
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
| `ANTHROPIC_API_KEY` | Copy generation | From console.anthropic.com. Without it the Brief panel is hidden. |
| `COPY_MODEL` | Optional | Defaults to `claude-sonnet-5`. |
| `COPY_EFFORT` | Optional | Thinking depth for the planner: `low` to `max`. Unset uses the model default. |
| `BRIEF_ENABLED` | Optional | `true` turns on conversational briefing. Off by default; the `/brief*` routes 404 without it. |

## Mobile app

Open the service's root URL on your phone (`https://your-app.up.railway.app/`).
Pick a brand, write a brief, hit Plan the posts. Review the queue, then save to
camera roll or push straight into the LinkedIn share sheet.

Add it to your home screen (Safari: Share, then Add to Home Screen) and it runs
full screen with its own icon like a native app.

New blocks are available to the planner as soon as they are registered in
`BLOCK_CATALOGUE`; the app itself needs no change, because it plans rather than
filling in a form.

### Writing copy in the app

With `ANTHROPIC_API_KEY` set, a Brief box appears above the fields. Type a rough
note about the post, tap Write the copy, and the fields fill in. Edit anything you
want, then render.

Brand voice lives in the token files (`voice` block) and is sent with every request,
so output sounds like the brand rather than generic SaaS marketing. Each field's
current default is shown to the model as a worked example, which is what keeps the
copy short enough to fit the layout.

## API

### `GET /health`
Returns `{ ok: true, blocks: [...] }`.

### Post queue

| Method | Route | Does |
|---|---|---|
| `GET` | `/posts` | List all posts, newest first |
| `GET` | `/posts/:id` | One post |
| `POST` | `/posts` | Create. Accepts one object or an array. Renders and stores the image. |
| `PATCH` | `/posts/:id` | Update. Changing `data` re-renders the image. |
| `DELETE` | `/posts/:id` | Remove the post and its render |
| `POST` | `/posts/rerender` | Re-render every post. Use after changing a block or brand tokens. |

Image URLs are derived on read from `R2_PUBLIC_BASE`, not stored on the record,
so changing the public base fixes every post at once. A `?v=` cache-buster is
appended from the render timestamp so phones pick up updated images.
Pass `"force": true` in a PATCH to re-render without changing anything.

Post shape:
```json
{
  "brand": "drivertrack",
  "format": "square",
  "spec": {
    "theme": "dark",
    "eyebrow": "Screening",
    "headline": "...",
    "accentWord": "",
    "display": false,
    "blocks": [ { "type": "body", "text": "..." } ]
  },
  "caption": "the LinkedIn caption",
  "firstComment": "goes in the first comment",
  "altText": "for accessibility",
  "note": "why this angle",
  "scheduledFor": "2026-08-04",
  "status": "draft"
}
```
Statuses: `draft`, `approved`, `posted`, `rejected`.

Posts live in R2 under `posts/`, renders under `renders/`.

### `POST /plan`

Turns a brief into complete posts: picks the theme and the blocks, writes every
field, chooses a screenshot, writes the caption, first comment and alt text.

```json
{ "brand": "drivertrack", "brief": "a week about peak hiring", "count": 3, "create": true }
```

- `create: true` (default) writes them straight into the queue as drafts.
- `create: false` returns the plan without saving, for review first.

It is given the brand voice, every block's `useWhen` line, the screenshot
catalogue, and the posts already in the queue so it does not repeat angles or reuse
the same shape. Anything it invents that does not exist (unknown block or
screenshot) is dropped and reported in `warnings` rather than reaching the renderer.

### Conversational briefing (in progress, off by default)

Being built to replace one-shot briefing with a conversation that converges on a working
brief and text drafts before anything renders. Plan and rationale in
`conversation-plan-v4.md`; the fixtures that decide whether it ships are in
`gate-fixtures.md`.

Set `BRIEF_ENABLED=true` to expose it. Sessions live in R2 under `briefs/`.

| Method | Route | Does |
|---|---|---|
| `POST` | `/brief` | Start a session. DriverTrack only. |
| `GET` | `/brief/:id` | The full session |
| `POST` | `/brief/:id/abandon` | End it |
| `GET` | `/briefs` | Resumable sessions, transcripts stripped |

Sessions carry a `rev` for double-submit and a turn lock for the second message sent
while the first is still running. Mutating calls send the `rev` they last saw and get a
`409` on a mismatch or a held lock. A lock older than two minutes is assumed dead and
stolen. Untouched sessions are swept to `abandoned` after fourteen days, on read.

Conversation, drafting and approve are not built yet.

### Product screenshots

The service signs into the DriverTrack demo tenant with headless Chromium, captures
each screen in the catalogue, frames it (rounded corners, soft shadow, transparent
background) and uploads it to R2 under `shots/`. Templates then reference shots by
name, e.g. `"heroImage": "pipeline"`.

Only the demo tenant is used. Marketing assets must never show real candidate data.

| Method | Route | Does |
|---|---|---|
| `GET` | `/shots` | The catalogue: shot names and what each one is good for |
| `POST` | `/shots/discover` | Signs in and reports the app structure, so the catalogue can be corrected |
| `POST` | `/shots/refresh` | Captures every shot. Pass `{"only":["pipeline"]}` to do one |

Extra environment variables:

| Var | Notes |
|---|---|
| `DT_BASE_URL` | Defaults to `https://www.drivertrack.co` |
| `DT_DEMO_EMAIL` | Demo tenant login |
| `DT_DEMO_PASSWORD` | Demo tenant password |

Each shot carries a `description` in `src/lib/capture.js`. That is what makes
screenshots content-aware: the planner reads the descriptions to pick the shot
that supports the argument a post is making.

### `POST /render`
```json
{
  "spec": {
    "theme": "dark",
    "eyebrow": "Peak hiring",
    "headline": "Screened before you open the office",
    "accentWord": "before you open",
    "display": false,
    "blocks": [ { "type": "body", "text": "..." } ]
  },
  "upload": false,
  "filename": "optional-name.png"
}
```
- `upload: false` (default) streams the PNG back.
- `upload: true` uploads to R2 and returns `{ ok, url, width, height, bytes }`.
- A bare spec (no `spec` wrapper) is accepted too.

## Blocks

A graphic is the locked shell (ground, logo, eyebrow, headline) plus one or two
blocks: `body`, `rows`, `compare`, `stat`, `screenshot`, `points`, `quote`, `cta`,
`thread`. Two maximum, three only if one is a `cta`. Each is defined in
`src/blocks.js` with a `useWhen` line the planner reads.

## Themes

Two, and the choice is a rule rather than a preference:

- **dark** for anything showing the product: threads, screenshots, screening
  decisions, pipelines.
- **light** for bold statement posts: an opinion or a piece of advice with no
  product in it.

Blocks never name a colour. The composer emits each theme as CSS custom properties
and blocks reference `var(--ink)` and so on, so one block renders in both.

DriverTrack renders default to square (1200x1200).

**Revive is not usable yet and is not offered in the app.** `src/tokens/revive.js` still
carries the old flat `color` block rather than `themes`, and has no `budget`, so the
planner rejects the brand with a clear message and the composer would render it in
DriverTrack blue regardless (`compose.js` and `blocks.js` import the DriverTrack tokens
directly). It comes back in `src/brands.js` when its token file has `themes` and
`budget`.

## Local use

```bash
npm install
npm start                                  # HTTP service on :3000
npm test                                   # pure tests, no network or Chromium
```

Set `ASSET_BASE` locally if you want logos to load:
```bash
ASSET_BASE="https://pub-xxxx.r2.dev" npm start
```

## Adding a block

1. Add a function to `src/blocks.js` returning `{ css, html }`.
2. Take every size from the brand token file, and every colour from a CSS custom
   property (`var(--ink)`), never a literal. The composer sets them per theme.
3. Register it in `BLOCKS` and add a `useWhen` line to `BLOCK_CATALOGUE` so the
   planner knows when to reach for it.

## Structure

```
src/
  tokens/        brand tokens (single source of truth)
    drivertrack.js
    revive.js
  lib/
    render.js    Chromium render engine, font embedding
    r2.js        Cloudflare R2 upload
  server.js      HTTP service (deploy entry point)
  assets/fonts/  Inter weights, embedded at render time
test/
  planner.test.js  validation and copy budgets, pure
```

## Notes

- Fira Sans weights need adding to `src/assets/fonts/` before building Revive blocks.
- Brand rules live in the token files as comments. Read them before designing.
