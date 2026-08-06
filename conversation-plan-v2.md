# Conversational briefing (reviewed plan v2)

A build plan for the app's brain. Today you put a brief in and posts come out. This
replaces that with a conversation that runs until both sides agree what is being made,
and only then renders.

Status: **reviewed plan, nothing built**. Supersedes `conversation-plan.md`. Locked
decisions replace the open questions in v1. Factual corrections against the current
tree are noted in §0.

---

## 0. For a reviewer without the repo

The service is a small Node 20 HTTP server (`node:http`, no framework) that renders
1200x1200 PNG social graphics with headless Chromium and stores them in Cloudflare R2.
There is no database. R2 holds JSON objects as well as images. There is no test suite
today (`package.json` has `start` only). Node 20's built-in `node --test` is available
without adding a runner.

The four pieces that matter here:

| File | What it does |
|---|---|
| `src/server.js` | Hand-rolled router. `POST /plan`, `POST /render`, `/posts/*`, `/shots/*`, `GET /` serves the app. Optional `x-api-key` gate via `RENDER_API_KEY`. CORS is `*`. |
| `src/lib/planner.js` | `planPosts({ brand, brief, count, create })`. One Anthropic call, brief in, array of posts out. `create: false` already returns validated posts without rendering. |
| `src/compose.js` | `compose(spec)` turns a spec into HTML. Enforces the block limit. |
| `src/lib/posts.js` | The queue. `createPost()` renders to PNG and writes JSON to R2. |
| `src/app.js` | The whole mobile UI as one template literal. No build step, no framework. |

A **spec** is the shape everything downstream speaks:

```json
{
  "theme": "dark",
  "eyebrow": "Peak hiring",
  "headline": "Screened before you open the office",
  "accentWord": "before you open",
  "display": false,
  "blocks": [ { "type": "body", "text": "..." } ]
}
```

A **post** wraps a spec with `caption`, `firstComment`, `altText`, `note`,
`scheduledFor`, `status`, and a rendered PNG at `renders/{id}.png`.

Design rules that constrain everything live in `DESIGN-SPEC.md`: one idea per graphic,
two blocks maximum (three only if one is a `cta`), fixed type sizes with word budgets,
a locked shell, and a theme rule (dark shows the product, light is for statement posts).

### Corrections vs v1

- v1 claimed `drawQueue()` still renders `esc(p.template)`. In the current `src/app.js`
  that line already shows `(p.spec && p.spec.theme) || p.brand`. **Do not schedule a
  fix for a bug that is gone.** If a rebase reintroduces `p.template`, drop it.
- v1 listed `ask` both as a tool and as "plain text ends the turn". v2 resolves this:
  **`ask` is not a tool.** It is the shape of a normal assistant transcript turn
  (`text` + optional `options` chips). Tools mutate state; chat replies end the loop.
- v1 left five product questions open. v2 locks them in §13.

---

## 1. How it works today

```
brief (textarea)
  -> POST /plan { brand, brief, count, create:true }
  -> planPosts(): one Anthropic call, ~3k token prompt
  -> parse JSON array, validate blocks against BLOCK_CATALOGUE, drop unknowns
  -> createPost() for each: compose -> Chromium -> PNG -> R2
  -> app jumps to the Queue tab
```

The prompt already carries brand voice, audience, block catalogue with `useWhen`,
screenshot catalogue, copy budgets, hard constraints, and the last 12 queued posts.

That prompt is good. The problem is not the prompt. It fires once, blind, with no
chance to ask anything.

### What actually goes wrong

1. **The model guesses at proof.** "Never invent a statistic, result, customer name or
   quote" is absolute. When the brief supplies no figure, the model falls back to
   reasoning and you get a weaker post than if it had asked for a real number.
2. **The theme rule is derived from a fact nobody stated.** Dark if the post shows the
   product, light if not. The brief rarely says. Wrong theme undoes asset recognition.
3. **Rejection is total.** Wrong angle means rewrite the brief from scratch.
4. **Rendering is expensive and happens first.** `create: true` ships PNGs before you
   have read a headline.
5. **No channel for "not that, this".** Correction is always a whole new brief.

---

## 2. What "on the same page" means

Agreement on a feeling is not checkable. The conversation converges on **two concrete
artefacts**, both visible at all times:

**The working brief.** A structured object, not prose. Accumulates as the conversation
goes. Rendered in the UI as a small card. Holds decisions, not chat.

**The drafts.** The actual posts as text, before any pixel is rendered. Headline,
eyebrow, blocks, caption, first comment. This is what you approve. Rendering is a
mechanical consequence of an agreement already reached.

Agreement is a **two-key handshake**:

- The assistant turns its key by calling `declare_ready`. Allowed only when every
  required slot is resolved and drafts exist (server-enforced).
- You turn yours by approving.
- Render needs both keys.

**Override:** `approve` with `force: true` renders whatever valid drafts are on the
table even if the assistant has not declared ready. The assistant can decline to
declare ready; it cannot hold the work hostage. Declaring ready alone renders nothing.

---

## 3. Architecture: Option C (locked)

### Rejected: A — chat refines a brief string, planner unchanged

You never agree to the posts, only to the brief. The planner re-rolls at the end.
Same surprise, later. Fatal.

### Rejected as default: B — chat writes specs directly

What you agree to is what renders, but the full catalogue, budgets, and validation must
ride in every turn and will drift from `planner.js`.

### Locked: C — conversation calls the planner as a tool

The chat model is a **producer**, not a copywriter. It interviews, keeps the working
brief, and when ready calls the existing planner with `create: false`. It presents the
returned specs as text, takes critique, re-plans or edits a field. Approve renders the
exact drafts on the table.

Why:

- **One place knows the design rules.** Block shapes, budgets, validation, screenshots,
  recent-post dedupe stay in `planner.js`.
- **What you see is what renders.** Approved artefact is the planner's output, carried
  forward. Theme is then **server-enforced** from `showsProduct` (see §4).
- **Conversation prompt stays small.** Block names + one-line `useWhen` only. No shapes.
- **`planPosts({ create: false })` already exists.**

Cost: a tool-use loop in the server (~100 lines with the guards below). Worth it.

**Fallback:** If after shipping C the interview-then-delegate split produces worse posts
than a single model holding full context, revisit B. Do not build B first.

---

## 4. The working brief

Nine slots. Each changes the output. None are decorative.

| Slot | Type | Why it matters | Ask or infer |
|---|---|---|---|
| `idea` | string | The single claim. Becomes the headline. | **Always required.** |
| `proof` | `{ kind: "figure" \| "quote" \| "none", detail }` | Decides whether `stat` / `quote` are legal. | **Always ask if unstated.** |
| `showsProduct` | boolean | Derives theme by rule; unlocks `thread` / `screenshot`. | **Always ask if unstated.** |
| `demonstration` | `"thread" \| "screenshot:<name>" \| "none"` | Which product asset carries it. | Ask only if `showsProduct`. |
| `intent` | `"direct" \| "opinion"` | Direct gets a `cta`. Opinion may use display mode. | Infer, state the guess. |
| `count` | 1 to 7 | How many posts. | **Never ask.** Default 2. User can say "just one". |
| `avoid` | string[] | Angles already covered. | Infer from the queue (same 12 as planner). |
| `schedule` | string | Goes on the post record only. | Infer, never ask. |
| `notes` | string[] | Anything that should reach the planner but fits no slot. | Accumulate silently. |

### Rules

**Theme is never asked about.** Ask "does this one show the product?" `themeRule` in
`src/tokens/drivertrack.js` derives the rest.

**Theme is server-enforced after every planner call.** After `draft_posts` /
`revise_drafts` / `edit_draft`, for each draft:

```
spec.theme = session.brief.showsProduct ? "dark" : "light"
```

The planner still sees the theme rule in its own prompt; the server is the source of
truth so a wrong model pick cannot stick. `composeBriefText` also states the theme
explicitly so the planner is steered before generation.

**Only three slots are worth a question:** `idea`, `proof`, `showsProduct`. Everything
else is a stated assumption.

**Two questions per turn, maximum.** Enforced in the system prompt. (Chips make answers
cheap; the cap still prevents interrogation.)

### `composeBriefText(session)` — exact contract

This is the bridge that makes Option C work. The planner receives a string brief, not
the structured object. The function must be deterministic and boring:

```
IDEA
{idea}

PROOF
{if figure: "Use this figure exactly: {detail}. The stat block is allowed."}
{if quote: "Use this quote exactly: {detail}. The quote block is allowed."}
{if none: "No figures or quotes are available. Argue from reasoning. Do NOT use the stat or quote blocks."}

PRODUCT
{if showsProduct: "This post SHOWS the product. Theme must be dark. Demonstration: {demonstration}."}
{else: "This post does NOT show the product. Theme must be light. No thread or screenshot blocks."}

INTENT
{direct: "Direct response. Include a cta." | opinion: "Opinion / advice. No cta. Display mode allowed."}

COUNT
Produce exactly {count} posts.

AVOID
{each avoid line, or "(none)"}

NOTES
{each note, or "(none)"}

SCHEDULE
{schedule or "(unspecified)"}
```

Unit-test this string for the three proof kinds and both product flags. A wrong
`PROOF` line is how invented statistics get back in.

---

## 5. The session record

Stored in R2 under `briefs/{id}.json`, alongside `posts/` and `renders/`. No new infra.

```json
{
  "id": "b_01J...",
  "brand": "drivertrack",
  "status": "open",
  "rev": 7,

  "brief": {
    "idea": "Screening runs overnight so mornings start with a shortlist",
    "proof": { "kind": "none", "detail": "" },
    "showsProduct": true,
    "demonstration": "thread",
    "intent": "direct",
    "count": 2,
    "avoid": ["peak hiring, done last week"],
    "schedule": "",
    "notes": ["wants the tone flatter than the last batch"]
  },

  "transcript": [
    { "role": "user", "text": "...", "at": "2026-08-05T09:14:02Z" },
    { "role": "assistant", "text": "...", "options": ["Yes", "No"], "at": "..." }
  ],

  "drafts": [
    {
      "draftId": "d1",
      "spec": {},
      "caption": "",
      "firstComment": "",
      "altText": "",
      "note": "",
      "scheduledFor": "",
      "state": "open",
      "postId": ""
    }
  ],

  "readyAt": "",
  "approvedAt": "",
  "postIds": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Status machine (explicit)

| From | To | Trigger |
|---|---|---|
| `open` | `drafted` | `draft_posts` succeeds with ≥1 draft |
| `drafted` | `ready` | `declare_ready` accepted |
| `ready` | `drafted` | Any successful `revise_drafts` / `edit_draft` / `update_brief` that invalidates readiness (see below) |
| `ready` / `drafted` / `open` | `rendered` | `approve` finishes and no open drafts remain |
| `*` | `abandoned` | `abandon`, or untouched 14 days (swept on read) |

**Invalidates readiness:** if status is `ready` and a mutating tool changes brief or
drafts, set status back to `drafted` (or `open` if drafts were cleared) and clear
`readyAt`. The assistant must `declare_ready` again. Prevents approving stale readiness
after a quiet edit.

`drafts[].state`: `open` | `approved` | `dropped`.
`drafts[].postId`: set when that draft has been rendered into a queue post. Makes
approve idempotent per draft.

`rev`: increments on every successful write. Mutating requests send the `rev` they last
saw; mismatch → `409`. For this single-user phone app, that covers double-submit
(sequential). Two concurrent writers that both read the same rev can still last-write-win;
accepted risk, documented, not worth a lock object in v1.

`id`: `b_` + `crypto.randomUUID()` (unguessable bearer for the session).

`transcript` is the human record. `brief` is the machine record. Keep separate so the
brief stays glanceable and survives transcript summarisation.

---

## 6. The turn loop

One user message drives one server-side loop. Tools for mutation; plain assistant text
(with optional chips) ends the turn.

```
POST /brief/:id/message { text, rev }
  |
  load session, reject if abandoned/rendered, check rev
  append user turn
  |
  loop (max 6 tool calls; max 1 planner-class tool per turn):
    call Anthropic (tool-capable) with:
      cached system block + transcript + brief JSON + drafts summary
    |
    +- update_brief(patch)     -> merge slots, maybe demote ready→drafted, continue
    +- draft_posts(count?)     -> planPosts(create:false), fill drafts, theme fix, status=drafted
    +- revise_drafts(feedback) -> re-plan open drafts only, theme fix
    +- edit_draft(id, patch)   -> patch one draft, validatePlan, theme fix
    +- declare_ready(summary)  -> status=ready, stop loop
    +- (assistant text)        -> append transcript turn { text, options? }, stop
  |
  bump rev, write R2, return session
```

**Planner-class tools:** `draft_posts`, `revise_drafts`. At most **one** of these per
user turn. Server rejects a second with a tool error result ("already planned this
turn; present the drafts or wait for the next message"). Rationale: each planner call
is a full Anthropic round trip nested inside the chat round trip; two in one request
is how you blow a proxy timeout. `edit_draft` is local validation only and does not
count against this cap.

### Tools

**`update_brief(patch)`** — merges resolved slots. Silent (no chat message of its own).
Unknown keys rejected. `proof.kind` must be one of the three enums.

**`draft_posts(count?)`** — callable only when `idea`, `proof.kind`, and `showsProduct`
are set (server check). Calls:

```
planPosts({
  brand: session.brand,
  brief: composeBriefText(session),
  count: count || session.brief.count,
  create: false,
})
```

Maps each returned post into a draft (`draftId: "d1"…`, `state: "open"`, `postId: ""`),
overwrites previous open drafts, leaves `approved` drafts untouched, applies theme
enforcement, sets status `drafted`. Returns `{ drafts, warnings }` as the tool result.
The model must then summarise them in plain text (next content, ends the loop).

**`revise_drafts(feedback)`** — re-runs planner with
`composeBriefText(session) + "\n\nREVISION FEEDBACK\n" + feedback` and a short dump of
the current open drafts for continuity. Replaces `state: "open"` drafts only.

**`edit_draft(draftId, patch)`** — patches allowed fields:
`spec.eyebrow`, `spec.headline`, `spec.accentWord`, `spec.display`, `spec.blocks`,
`caption`, `firstComment`, `altText`, `note`, `scheduledFor`.
Runs `validatePlan` on the post-shaped object. On validation failure: tool returns
`{ ok:false, error, warnings }`, **session unchanged**. On success: apply, theme-fix,
demote readiness if needed.

**`declare_ready(summary)`** — server rejects unless required slots are filled and at
least one `open` or already-`approved` draft exists. Sets `ready` / `readyAt`. Stops
the loop. The `summary` is shown in chat as the assistant text for that turn.

There is **no `ask` tool**. When the model needs a question, it returns normal text with
optional `options: string[1..4]`. The UI renders those as tappable chips that submit as
the next user message.

### Prompt construction

System block, `cache_control: { type: "ephemeral" }`, static per brand:

- Role: producer, not writer. You do not write headlines. You interview, keep the brief,
  call the planner when enough.
- Brand voice + audience from `tokens/{brand}.voice`.
- Block names + first line of each `useWhen` from `BLOCK_CATALOGUE`. **Not shapes.**
- Theme rule as derivation, not a choice.
- Hard constraints: one idea, two blocks max, never invent proof.
- Conversation rules: ≤2 questions/turn; state best guess for anything not asked;
  prefer proposing to asking; stop asking once the three required slots are resolved;
  after drafts exist, summarise them before `declare_ready`.

Per turn: transcript, working brief JSON, compact drafts summary (draftId, state,
headline, block types, caption first line).

Models: chat uses `process.env.BRIEF_MODEL || process.env.COPY_MODEL || "claude-sonnet-5"`.
Planner keeps using `COPY_MODEL` inside `planPosts`. Same key.

### Latency budget (message endpoint)

Worst case one turn: chat tokens + one `planPosts` call. UI shows a persistent
"Working…" state for the whole request. No streaming in v1. If Railway/proxy timeout
is hit in practice, the fix is streaming or background jobs — noted in §8, not built now.
Cap of one planner-class tool per turn is the v1 mitigation.

---

## 7. Partial approval

Each draft has its own `state`.

`POST /brief/:id/approve { rev, only?, force? }`:

1. Resolve target drafts: `only` if provided, else every draft in `open` (and, when
   status is `ready` or `force`, that is the normal path). Drafts already
   `approved` with a `postId` are skipped (idempotent).
2. Reject with `400` if no target drafts have a valid `spec.headline`.
3. Reject with `400` if status is not `ready` and `force` is not true.
4. Cap targets at **3** per call (proxy timeout). Return `400` naming the cap if more
   requested; client approves the rest in a second call.
5. For each target, `createPost({ ...draft fields, brand })`, set `draft.state =
   "approved"`, `draft.postId = post.id`, push into `session.postIds`.
6. If `createPost` throws mid-batch: write session with the successes so far, return
   `207`-shaped JSON `{ ok:false, error, posts, drafts }` and **do not** set status
   `rendered`. Retry of approve continues remaining open targets; already-`postId`
   drafts are skipped. No double render.
7. When no draft remains `state: "open"`, set status `rendered`, `approvedAt = now`.
8. If some drafts remain open, leave status at `ready` or `drafted` (if readiness was
   never set) so the conversation can continue about the rest.

`revise_drafts` / `edit_draft` only touch `open` drafts.

Without partial approval, "talk until we agree" collapses to all-or-nothing.

---

## 8. API surface

Every route behind the existing optional `x-api-key` gate. **Production should set
`RENDER_API_KEY`.** Session ids are unguessable, but CORS is `*` and without a key the
session id is the only secret.

| Method | Route | Body | Returns |
|---|---|---|---|
| `POST` | `/brief` | `{ brand, text? }` | New session. Runs first turn if `text` given. |
| `GET` | `/brief/:id` | | Full session. |
| `POST` | `/brief/:id/message` | `{ text, rev }` | Session after turn. `409` on stale rev. |
| `POST` | `/brief/:id/approve` | `{ rev, only?, force? }` | `{ ok, posts, drafts }` (see §7). |
| `POST` | `/brief/:id/abandon` | `{ rev }` | Marks abandoned. |
| `GET` | `/briefs` | | Open + drafted + ready sessions, newest first, **transcript stripped**, drafts summarised to `{ draftId, state, headline }`. |

`POST /plan` **stays unchanged.** Automation path and escape hatch.

Approve is idempotent per draft via `postId`. If status is already `rendered`, return
existing `postIds` without rendering again.

### Timeout

`approve` is synchronous Chromium, same as today's `create: true`. Cap at 3 posts per
call; partial approval covers the rest. Background render jobs are out of scope for v1.

`message` can nest one planner call; see §6 latency budget.

---

## 9. The app

`src/app.js` gains a Chat tab. The Make tab's brief textarea retires into Chat.
**Keep a small "Quick plan" escape** (one tap → old `POST /plan` with `create: true`)
behind a disclosure on the Chat view so automation-from-phone still exists without a
second tab. Queue is untouched.

Layout, top to bottom:

- **Brief card**, sticky under the header. Lines: Idea, Proof, Shows product, Posts.
  Muted for inferred, full ink for confirmed. Glanceable agreement.
- **Transcript.** Bubbles. Existing dark chrome.
- **Draft cards**, inline where produced. Headline (Inter ExtraBold), eyebrow, block
  list, caption behind "Show all". Per card: `Approve` and `Change this` (sends a
  short user message naming the draftId).
- **Composer**, fixed bottom. Text + send. Chips above the field when the last
  assistant turn has `options`.
- **Approve all**, enabled when status is `ready` (or always available as force with
  a confirm).

Constraints: no build step, no framework, one template literal, vanilla DOM, `fetch`.

**Voice input in phase 4:** `webkitSpeechRecognition` mic button on the composer.
Safari-on-iPhone is the target. Feature-detect; hide if absent. ~15 lines.

**409 handling:** on stale rev, `GET /brief/:id`, replace local session, toast
"Updated — try again", do not show a hard error.

---

## 10. Guardrails

**Interrogation.** Countered by: ≤2 questions/turn in the prompt; only three askable
slots; stated best guess for the rest; user can `force` approve anytime drafts exist.

**Drift from design rules.** Chat model never writes a spec. Every spec comes from
`planPosts` / `validatePlan`. `compose()` enforces the block limit again.

**Invented proof.** `proof.kind` required. `composeBriefText` states availability in
words. If `none`, the planner brief forbids stat/quote blocks.

**Theme drift.** Server overwrite after every planner/edit path (§4).

**Transcript growth.** Cap 40 turns. Past 24, summarise oldest half into one system
note via a single Anthropic call; keep working brief intact. Brief is memory;
transcript is audit.

**Lost sessions.** `GET /briefs` lists resumable ones. On read, anything `open|drafted|ready`
with `updatedAt` older than 14 days → `abandoned`.

**Double submit.** `rev` on mutating calls; UI reloads on `409`.

**Tool loop that will not end.** Hard cap 6 tool calls/turn; on cap, flush a plain
assistant message with current state.

**Planner failure.** Catch, return error as tool result, allow one retry in-loop, then
surface in chat. Session survives.

**Nested timeout.** Max one planner-class tool per turn (§6).

**Partial approve failure.** Persist successes, return error, retry skips `postId`s (§7).

---

## 11. What changes in existing files

| File | Change | Size |
|---|---|---|
| `src/lib/planner.js` | Extract validation (clean loop ~165–213) into `export function validatePlan(plans, brand)` returning `{ posts, warnings }`. `planPosts` calls it. Export a tiny `blockNamesForPrompt()` helper (name + first sentence of `useWhen`). No behaviour change to `planPosts` outputs. | Small |
| `src/lib/brief.js` | **New.** Session store, `composeBriefText`, turn loop, tool defs, status transitions, approve. | ~400 lines |
| `src/lib/brief-log.js` | **New.** One-liner structured logs (see §14). | ~30 lines |
| `src/server.js` | Six routes, same pattern as `/posts`. | ~80 lines |
| `src/app.js` | Chat view, brief card, draft cards, composer, chips, 409 reload, optional Quick plan disclosure, mic. | ~280 lines |
| `src/lib/posts.js` | None. | None |
| `src/compose.js` | None. | None |
| `package.json` | Add `"test": "node --test test/**/*.test.js"`. | Trivial |
| `test/brief.test.js` | Pure tests (see §12). | ~150 lines |
| `README.md` | New routes + flow. | Small |

Nothing deleted. `POST /plan` and `POST /render` behave identically.

---

## 12. Build phases and tests

Each phase is independently testable. Stop after any and still be ahead.

**Phase 0. Extract.** `validatePlan` out of `planPosts`. Confirm `POST /plan` behaviour
unchanged (same fixtures in, same clean shape out). Land alone.

**Phase 1. Session store.** `briefs/` in R2: create, read, patch with rev, abandon.
No model. Curl + `node --test` for an in-memory fake of `putJson/getJson` if we inject
the store; otherwise curl against a dev bucket.

**Phase 2. Turn loop without drafting.** Tools: `update_brief` only. Assistant text +
options. Curl a conversation that fills the three required slots.

**Phase 3. Drafting + approve.** `draft_posts`, `revise_drafts`, `edit_draft`,
`declare_ready`, `approve` with partial + failure mid-batch. Curl the full flow.

**Phase 4. App.** Chat UI, brief card, drafts, chips, mic, Quick plan disclosure.

**Phase 5. Polish.** Prompt caching, transcript summarisation, `GET /briefs` resume,
14-day sweep, structured log fields complete.

### Automated tests (`node --test`) — required before Phase 3 is "done"

| Test | Asserts |
|---|---|
| `composeBriefText` proof none/figure/quote | Exact substrings; `none` forbids stat/quote language |
| `composeBriefText` showsProduct true/false | Theme sentence matches |
| `validatePlan` drops unknown blocks / bad screenshots | warnings + filter |
| `validatePlan` enforces block limit | 3 non-cta → 2 |
| `mergeBrief` rejects bad proof.kind | error, no mutate |
| status: ready then edit_draft | demotes to drafted, clears readyAt |
| approve idempotency | draft with postId skipped |
| approve cap | 4 targets → error, none rendered |
| rev mismatch | 409 path (pure function `assertRev`) |
| theme enforce | showsProduct true → dark regardless of planner theme |

No Chromium in unit tests. No Anthropic in unit tests. Curl covers the wired path.

---

## 13. Locked product decisions (were "open questions" in v1)

1. **`count` is not conversational.** Default 2, never asked. User may say "just one" /
   "give me four"; that updates the slot via `update_brief`. The conversation settles
   one idea; count is a knob, not an interview topic.
2. **No mid-conversation render.** Drafts are text. Spec is deterministic enough that
   the variable parts are all visible. Revisit only if textual drafts prove untrusted.
3. **Voice input ships in phase 4.** Feature-detected mic on the composer.
4. **Many concurrent sessions per brand.** `GET /briefs` to resume. One-active would
   fight the "leave it and come back" phone habit.
5. **No vision on queue images in v1.** Captions/notes for dedupe stay as today inside
   `planPosts`.
6. **Quick plan escape stays** as a disclosure, not a second tab (§9).
7. **`ask` is message shape, not a tool** (§0, §6).

---

## 14. Observability

Every significant event is one JSON line on stdout (Railway grabs it):

```
{ "evt": "brief.turn.start", "id", "rev", "brand" }
{ "evt": "brief.tool", "id", "tool", "ok", "ms" }
{ "evt": "brief.turn.end", "id", "rev", "status", "ms", "tools" }
{ "evt": "brief.ready", "id" }
{ "evt": "brief.approve", "id", "count", "ok", "ms", "postIds" }
{ "evt": "brief.error", "id", "where", "message" }
```

No new metrics backend. Warnings from `planPosts` are included in the `brief.tool`
line and in the tool result the model sees.

---

## 15. Security and data safety

- Same `x-api-key` gate as `/posts` and `/plan` on every `/brief*` route.
- Session id is a bearer token (`crypto.randomUUID()`). Do not put ids in public logs
  beyond the `brief.*` lines above (those stay on the server).
- `GET /briefs` strips transcripts.
- `force` approve cannot create posts from empty/invalid drafts.
- Do not log full transcript bodies or proof detail at `info` level.
- README states: set `RENDER_API_KEY` in production; without it, anyone who can reach
  the host can start sessions (true today for `/plan` as well).

---

## 16. Claims worth attacking

1. **Option C over B.** If interview-then-delegate is worse than one model writing
   specs, the machinery is wasted. Mitigation: measure after phase 3 by comparing the
   same brief through `/plan` vs through chat→`draft_posts` on three real ideas.
2. **Three askable slots.** If `showsProduct` is reliably inferable, drop that question
   later; do not drop it in v1.
3. **Two-key handshake.** `declare_ready` is load-bearing because it forces the model
   to stop asking and present drafts; without it the interrogation guard is prompt-only.
4. **Synchronous approve capped at 3.** Good enough for a single-user phone tool.
5. **One planner call per message turn.** Trades multi-step revise-in-one-breath for
   not timing out. User sends a second message to revise again.

Assumptions: R2 latency is invisible behind Anthropic; single user means rev races are
double-submit not multiplayer; the existing planner prompt is good and this feature is
about feeding it better input.
