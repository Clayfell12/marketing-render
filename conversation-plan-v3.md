# Conversational briefing (plan v3)

A build plan for the app's brain. Today you put a brief in and posts come out. This
replaces that with a conversation that runs until both sides agree what is being made,
and only then renders.

Status: **plan only, nothing built**. Supersedes `conversation-plan.md` (v1) and
`conversation-plan-v2.md` (v2). Every factual claim about the tree was re-verified on
5 August 2026 against the working tree, not against v1 or v2.

---

## 0. For a reviewer without the repo

A small Node HTTP server (`node:http`, no framework) that renders 1200x1200 PNG social
graphics with headless Chromium and stores them in Cloudflare R2. No database: R2 holds
JSON objects as well as images. `engines` says Node >=20; the dev machine runs v24.
There is no test suite.

| File | What it does |
|---|---|
| `src/server.js` | Hand-rolled router. `POST /plan`, `POST /render`, `/posts/*`, `/shots/*`, `GET /` serves the app. Optional `x-api-key` gate via `RENDER_API_KEY`. CORS `*`. |
| `src/lib/planner.js` | `planPosts({ brand, brief, count, create })`. One Anthropic call, brief in, posts out. `create: false` already returns validated posts without rendering. |
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

Design rules live in `DESIGN-SPEC.md`: one idea per graphic, two blocks maximum (three
only with a `cta`), fixed type sizes with word budgets, a locked shell, and a theme rule
(dark shows the product, light is for statement posts).

### Corrections carried forward and applied

**From v2, accepted.** v1 claimed `drawQueue()` still rendered `esc(p.template)`. It does
not: `src/app.js:317` now reads `esc((p.spec && p.spec.theme) || p.brand || "")`. The fix
landed in the working tree after v1 was written. No queue-card fix is scheduled.

**v2's own errors, corrected here.**

1. v2 says "`package.json` has `start` only". It has two scripts, and the second,
   `"render": "node scripts/render.js"`, points at a directory that **no longer exists**.
   `npm run render` is broken today. Delete the script (§15).
2. v2 proposes `"test": "node --test test/**/*.test.js"`. npm scripts run through
   `cmd.exe` on Windows, which does not expand `**`. Node 20+ discovers test files
   natively, so the script is simply `"test": "node --test"`.

**Neither plan checked the model contract.** Two consequences, both material, in §5 and §8.

---

## 1. How it works today, and what goes wrong

```
brief -> POST /plan { brand, brief, count, create:true }
      -> planPosts(): one Anthropic call, ~3k token prompt
      -> parse JSON, validate blocks, drop unknowns
      -> createPost() each: compose -> Chromium -> PNG -> R2
      -> app jumps to the Queue tab
```

The prompt already carries brand voice, audience, the block catalogue with `useWhen`, the
screenshot catalogue, copy budgets, hard constraints, and the last 12 queued posts. The
prompt is good. It fires once, blind, with no chance to ask anything.

1. **It guesses at proof.** "Never invent a statistic, result, customer name or quote" is
   absolute, so with no figure in the brief it silently falls back to reasoning and you
   get a weaker post than if it had asked.
2. **Theme is derived from a fact nobody stated.** Dark shows the product, light does
   not. The brief rarely says. A wrong theme undoes asset recognition.
3. **Rejection is total.** Wrong angle means rewriting the brief from scratch.
4. **The expensive step happens first.** `create: true` ships PNGs before you read a headline.
5. **No channel for "not that, this".** Every correction is a whole new brief.

---

## 2. What "on the same page" means

Agreement on a feeling is not checkable. The conversation converges on **two concrete
artefacts**, both visible at all times.

**The working brief.** A structured object, not prose. Accumulates as the conversation
goes; rendered in the UI as a card. Holds decisions, not chat.

**The drafts.** The actual posts as text, before any pixel. Headline, eyebrow, blocks,
caption, first comment. This is what you approve. Rendering becomes a mechanical
consequence of an agreement already reached.

Agreement is a **two-key handshake**: the assistant turns its key with `declare_ready`
(server-enforced: required slots filled, drafts exist), you turn yours by approving,
render needs both. **Override:** `approve` with `force: true` renders whatever valid
drafts are on the table. The assistant can decline to be ready; it can never hold the
work hostage. Declaring ready alone renders nothing.

---

## 3. Architecture: Option C, locked

**A — chat refines a brief string, planner unchanged.** You never agree to the posts,
only to the brief; the planner re-rolls at the end. Same surprise, later. Fatal.

**B — chat writes specs directly.** What you agree to is what renders, but the catalogue,
budgets and validation ride in every turn and will drift from `planner.js`.

**C — the conversation calls the planner as a tool. Locked.** The chat model is a
**producer**, not a copywriter. It interviews, keeps the brief, and when ready calls
`planPosts({ create: false })`. It presents the returned specs as text, takes critique,
re-plans or edits a field. Approve renders the exact drafts on the table.

- One place knows the design rules: block shapes, budgets, validation, screenshots,
  dedupe all stay in `planner.js`.
- What you see is what renders, with theme server-enforced afterwards (§4).
- The conversation prompt stays small: block names and one-line `useWhen`, no shapes.
- `planPosts({ create: false })` already exists.

**Fallback:** if the §13 gate shows interview-then-delegate is worse than one model
holding full context, revisit B. Do not build B first.

---

## 4. The working brief

| Slot | Type | Why it matters | Ask or infer |
|---|---|---|---|
| `idea` | string | The single claim. Becomes the headline. | **Always required.** |
| `proof` | `{ kind: "figure" \| "quote" \| "none", detail }` | Decides whether `stat` / `quote` are legal. | **Always ask if unstated.** |
| `showsProduct` | boolean | Derives theme; unlocks `thread` / `screenshot`. | **Always ask if unstated.** |
| `demonstration` | `"thread" \| "screenshot:<name>" \| "none"` | Which product asset carries it. | Ask only if `showsProduct`. |
| `intent` | `"direct" \| "opinion"` | Direct gets a `cta`; opinion may use display mode. | Infer, state the guess. |
| `count` | 1 to 7 | How many posts. | **Never ask.** Default 2. |
| `avoid` | string[] | Angles already covered. | Infer from the queue. |
| `schedule` | string | Post record only. | Infer, never ask. |
| `notes` | string[] | Anything that should reach the planner but fits no slot. | Accumulate silently. |

**Theme is never asked about.** Ask "does this one show the product?" and let `themeRule`
in `src/tokens/drivertrack.js` derive the rest.

**Theme is server-enforced.** After `draft_posts` / `revise_drafts` / `edit_draft`, for
every draft: `spec.theme = brief.showsProduct ? "dark" : "light"`. The planner still sees
the rule in its own prompt so it is steered before generation; the server is the source
of truth so a wrong pick cannot stick.

**Only `idea`, `proof`, `showsProduct` are ever worth a question.** Everything else is a
stated assumption. **Two questions per turn maximum.**

### `composeBriefText(session)` — exact contract

The bridge that makes Option C work. Deterministic and boring:

```
IDEA
{idea}

PROOF
{figure: "Use this figure exactly: {detail}. The stat block is allowed."}
{quote:  "Use this quote exactly: {detail}. The quote block is allowed."}
{none:   "No figures or quotes are available. Argue from reasoning. Do NOT use the stat or quote blocks."}

PRODUCT
{true:  "This post SHOWS the product. Theme must be dark. Demonstration: {demonstration}."}
{false: "This post does NOT show the product. Theme must be light. No thread or screenshot blocks."}

INTENT
{direct: "Direct response. Include a cta." | opinion: "Opinion / advice. No cta. Display mode allowed."}

AVOID
{each avoid line, or "(none)"}

NOTES
{each note, or "(none)"}

SCHEDULE
{schedule or "(unspecified)"}
```

**Changed from v2: no COUNT section.** v2 emitted `Produce exactly {count} posts` into the
brief text *and* passed `count` as a parameter to `planPosts`, which already renders
`Plan ${count} LinkedIn post(s)` at the top of its own prompt. Two numbers in one prompt
that can disagree. Count is a parameter, and only a parameter.

Unit-test this string for the three proof kinds and both product flags. A wrong `PROOF`
line is how invented statistics get back in.

---

## 5. Copy budgets: the enforcement that does not exist

**This is new in v3 and it blocks `edit_draft`.**

v2 says `edit_draft` "runs `validatePlan` on the post-shaped object". The validation loop
at `planner.js:165-213` checks block types against `BLOCK_CATALOGUE`, drops unknown
screenshots, enforces the block limit, and requires a headline. It does **not** check the
copy budgets, because the budgets (`headline: 9`, `display: 6`, `body: 18`, `small: 14`
in `src/tokens/drivertrack.js`) have never existed as code. They are instructions inside
`buildPrompt` and nothing else.

That has been safe so far because only the planner writes copy, and the planner is told
the budgets. `edit_draft` breaks that: it applies your words to a spec directly. "Make the
headline punchier" can return fourteen words, pass every existing check, render, and
overflow `max-width:17ch` at 92px. The composer will not save you, it wraps.

**So Phase 3 adds `checkBudgets(spec, brand)`** in `planner.js`, returning
`[{ field, words, budget }]`:

| Field | Budget source |
|---|---|
| `headline` (display false) | `budget.headline` |
| `headline` (display true) | `budget.display` |
| `body` block `text` | `budget.body` |
| `rows` item `detail`, `compare` column `text`, `stat` `label` | `budget.small` |
| `points` items | 8 words, per `BLOCK_CATALOGUE` |
| `eyebrow` | 4 words |

**Warnings, not hard failures.** They come back as the `edit_draft` tool result so the
model shortens and retries in the same turn, and they are surfaced on the draft card so
you can see the graphic is at risk. A hard failure would make `edit_draft` refuse edits
you might have wanted anyway.

Also wire `checkBudgets` into `draft_posts` as a reported warning. The planner is *told*
the budgets today and nothing verifies it complied.

---

## 6. The session record

R2 under `briefs/{id}.json`, alongside `posts/` and `renders/`. No new infrastructure.

```json
{
  "id": "b_01J...",
  "brand": "drivertrack",
  "status": "open",
  "rev": 7,
  "lock": { "heldSince": "", "turnId": "" },

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
    { "draftId": "d1", "spec": {}, "caption": "", "firstComment": "", "altText": "",
      "note": "", "scheduledFor": "", "state": "open", "postId": "", "warnings": [] }
  ],

  "nextDraftSeq": 2,
  "readyAt": "", "approvedAt": "", "postIds": [],
  "createdAt": "...", "updatedAt": "..."
}
```

### Status machine

| From | To | Trigger |
|---|---|---|
| `open` | `drafted` | `draft_posts` succeeds with >=1 draft |
| `drafted` | `ready` | `declare_ready` accepted |
| `ready` | `drafted` | Any mutating tool that changes brief or drafts; clears `readyAt` |
| any | `rendered` | `approve` finishes and no open drafts remain |
| any | `abandoned` | `abandon`, or untouched 14 days, swept on read |

### The turn lock — the concurrency fix v2 misses

v2 relies on `rev` and dismisses concurrent writers as accepted risk for a single user.
`rev` does not cover the case that will actually happen.

A turn takes several seconds: a chat call, sometimes a nested planner call. During all of
it the session in R2 is unchanged. Send a second message while the first is in flight,
which is precisely what a phone user does when the first feels slow, and both requests
read `rev: 7`, both process, and the second write silently discards the first turn's
transcript and drafts. Optimistic concurrency cannot catch this because both reads happen
before either write.

**Fix.** `POST /brief/:id/message` writes `lock: { heldSince: now, turnId }` and bumps
`rev` **before** calling Anthropic. A second message arriving while `lock.heldSince` is
set and fresher than 120 seconds gets `409 { error: "turn in progress" }`. A stale lock
(over 120s, meaning the process died mid-turn) is stolen with a log line. The lock clears
on the final write of the turn, success or failure.

`rev` stays, for the ordinary double-submit case. It is just not the whole story.

Other fields: `id` is `"b_" + crypto.randomUUID()`, unguessable because it is a bearer
token for the conversation. `drafts[].state` is `open | approved | dropped`.
`drafts[].postId` makes approve idempotent per draft. `transcript` is the human record,
`brief` is the machine record; separate so the brief stays glanceable and survives
summarisation.

**Draft ids are minted once and never reused.** `nextDraftSeq` is a monotonic counter on
the session. v2 assigned `d1..dn` on draft creation and had `revise_drafts` "replace open
drafts", which renumbers: approve `d1`, revise the rest, and the card labelled `d2` now
holds different content from the one you were reading. Ids are permanent; revision mints
new ones and marks the replaced ones `dropped`.

---

## 7. The turn loop

One user message drives one server-side loop. Tools mutate; plain assistant text, with
optional chips, ends the turn. There is **no `ask` tool** — a question is a normal
transcript turn with `options: string[1..4]`, rendered as tappable chips.

```
POST /brief/:id/message { text, rev }
  |
  load session; reject if abandoned/rendered; check rev; take turn lock; write
  append user turn
  |
  loop (max 6 tool calls; max 1 planner-class tool per turn):
    call Anthropic: cached system block + transcript + brief JSON + drafts summary
    |
    if stop_reason == "tool_use":
      execute EVERY tool_use block in the message         <- see below
      append ONE user message containing ALL tool_result blocks
      continue
    else:
      append assistant text turn { text, options? }; stop
  |
  release lock; bump rev; write R2; return session
```

### Parallel tool calls — the API contract v2's loop breaks

v2's loop dispatches one tool per iteration. One assistant message can carry several
`tool_use` blocks, and `update_brief` followed immediately by `draft_posts` is the obvious
pair the model will produce. The contract is: execute them all, then return **every**
`tool_result` in a **single** user message. Splitting results across messages trains the
model out of parallel calls, and returning only one of two results is rejected outright.

So: collect all `tool_use` blocks from the assistant message, execute in order, collect
all results, send one user message. A tool that fails returns its `tool_result` with
`is_error: true` rather than being dropped.

The one-planner-class-tool cap still holds, but it is now enforced *within* the batch: if
a single message contains both `draft_posts` and `revise_drafts`, the second gets an error
result ("already planned this turn"), not a silent drop. Each planner call is a full
Anthropic round trip nested inside the chat round trip; two in one request is how you blow
a proxy timeout.

### The tools

All tool definitions carry `strict: true` with `additionalProperties: false` and explicit
`required`. That moves v2's manual server-side checks (`proof.kind` enum, unknown keys) to
the API layer, where the model retries on mismatch instead of you handling a malformed
patch.

**`update_brief(patch)`** — merges resolved slots. Silent, no chat message of its own.

**`draft_posts(count?)`** — callable only when `idea`, `proof.kind` and `showsProduct` are
set (server check, not trusted to the prompt). Calls:

```
planPosts({ brand, brief: composeBriefText(session), count: count || brief.count, create: false })
```

Maps each returned post to a draft with a freshly minted `draftId`, `state: "open"`,
applies theme enforcement, runs `checkBudgets` into `draft.warnings`, sets status
`drafted`. Returns `{ drafts, warnings }`. Previously-`approved` drafts are untouched.

**`revise_drafts(feedback)`** — re-runs the planner with
`composeBriefText(session) + "\n\nREVISION FEEDBACK\n" + feedback` plus a short dump of the
current open drafts for continuity. **Asks for exactly `openDrafts.length` posts**, not
`brief.count` — v2 left this unspecified, and asking for 3 when 2 slots are open produces a
mismatch. Replaces `state: "open"` drafts only; the replaced ones become `dropped`.

**`edit_draft(draftId, patch)`** — patches `spec.eyebrow`, `spec.headline`,
`spec.accentWord`, `spec.display`, `spec.blocks`, `caption`, `firstComment`, `altText`,
`note`, `scheduledFor`. Runs `validatePlan` **and `checkBudgets`**. On validation failure:
`{ ok: false, error }`, session unchanged. On success: apply, theme-fix, attach budget
warnings, demote readiness. Local only, does not count against the planner cap.

**`declare_ready(summary)`** — server rejects unless required slots are filled and at least
one draft exists. Sets `ready` / `readyAt`. Stops the loop; `summary` becomes the
assistant's text for that turn.

---

## 8. Model, caching, and what it actually costs

Neither v1 nor v2 checked this. Both are wrong about it in ways that matter.

### Model choice

**Chat layer: `claude-opus-5`** (`BRIEF_MODEL` env, defaulting to it). The interview
quality is the entire feature, and the cost delta is pennies per session (below).

**Planner: unchanged**, `COPY_MODEL || "claude-sonnet-5"`. That is an existing, explicit
choice in the repo and this feature does not relitigate it.

### The prompt cache minimum bites

Minimum cacheable prefix is **512 tokens on Opus 5** and **1024 on Sonnet 5**. Below the
minimum, `cache_control` is silently ignored: no error, just
`cache_creation_input_tokens: 0` forever. v1 sized the system block at "around 900
tokens", which caches on Opus 5 and **would not** on Sonnet 5. v2 kept the
`cache_control` and dropped the size estimate, so it would have shipped a marker that
might do nothing.

Rule: the system block targets **>=1100 tokens** so it caches on either model, and Phase 2
asserts `usage.cache_read_input_tokens > 0` on the second turn of a session. If that
assertion fails, something in the prefix is varying.

**Caching moves to Phase 2, not Phase 5.** It is `cache_control: { type: "ephemeral" }` on
one block, and it is cheapest to get right while writing that block rather than bolting it
on after four phases of habits have formed. Keep the block byte-stable: no timestamps, no
session id, no per-turn interpolation. Render order is tools, then system, then messages,
so the marker on the last system block covers the tool definitions too.

Note the 5-minute default TTL. A conversation with gaps longer than that pays the write
again. Not worth engineering around at this volume; just do not be surprised by it.

### The existing planner may already be truncating

`planner.js` sets `max_tokens: 8000` and omits `thinking`. On `claude-sonnet-5`, omitting
`thinking` runs **adaptive thinking**, and `max_tokens` caps thinking *plus* response text
together. At count 5 to 7 the JSON array is long and thinking can eat a meaningful share
of the budget. Truncated output is invalid JSON, which lands in the `catch` at
`planner.js:158` and surfaces as "Could not read the plan. Try rewording the brief." —
a message that blames the brief for a token ceiling.

This is a latent bug in existing code, not something the feature introduces. It matters
here for two reasons: the conversation nests a planner call inside a chat turn, so a
truncation failure is now a worse experience; and **Phase 0 cannot verify "`/plan` is
unchanged" against a baseline that fails intermittently**.

**Phase 0 therefore also raises `max_tokens` to 16000 and sets `thinking` explicitly**, so
the setting is a decision rather than a default nobody chose. Adaptive with `effort: "low"`
is the sensible starting point for structured JSON generation against a prompt this
prescriptive. Measure before and after on the same brief at count 5.

### Cost, computed

Per converged session: roughly ten chat turns and two planner calls.

| Component | Tokens | Rate | Cost |
|---|---|---|---|
| System block, cache write once | 1,100 x 1.25 | $5/M in | $0.007 |
| System block, 9 cache reads | 9 x 1,100 x 0.1 | $5/M | $0.005 |
| Variable input (transcript growth) | ~12,000 | $5/M | $0.060 |
| Chat output, ~300 avg x 10 | 3,000 | $25/M | $0.075 |
| 2 planner calls (Sonnet 5) | ~3,000 in, ~2,500 out each | $2/$10 per M | $0.062 |
| **Total** | | | **~$0.21** |

Twenty sessions a week is about **$4.20**, roughly £3.30. Sonnet 5's introductory rate
ends 31 August 2026 and the planner line rises by about half; still immaterial.

**The honest conclusion: cost is not a constraint here.** Caching is worth doing for
latency and prefix discipline, not for money. And transcript summarisation at 24 turns is
about keeping the model's attention on the brief, not about the bill — which is a better
reason and a different threshold. Do not let anyone justify machinery on cost grounds.

---

## 9. Partial approval

Each draft has its own `state`. `POST /brief/:id/approve { rev, only?, force? }`:

1. Resolve targets: `only` if given, else every `open` draft. Drafts with a `postId` are
   skipped (idempotent).
2. `400` if no target has a valid `spec.headline`.
3. `400` if status is not `ready` and `force` is not true.
4. Cap at **3** per call (proxy timeout). More returns `400` naming the cap; the client
   approves the rest in a second call.
5. For each: `createPost({ ...draft fields, brand })`, set `state: "approved"`, `postId`,
   push to `session.postIds`.
6. On mid-batch failure: persist successes, return `{ ok: false, error, posts, drafts }`,
   do **not** set `rendered`. Retry continues remaining targets; `postId` drafts are
   skipped. No double render.
7. No `open` drafts left, set `rendered` and `approvedAt`. Otherwise leave status alone so
   the conversation continues about the rest.

Without partial approval, "talk until we agree" collapses to all-or-nothing, which is what
we started with.

---

## 10. API surface

Behind the existing `x-api-key` gate. **Production must set `RENDER_API_KEY`**: session
ids are unguessable, but CORS is `*` and without a key the id is the only secret.

| Method | Route | Body | Returns |
|---|---|---|---|
| `POST` | `/brief` | `{ brand, text? }` | New session; runs first turn if `text` given |
| `GET` | `/brief/:id` | | Full session |
| `POST` | `/brief/:id/message` | `{ text, rev }` | Session after turn. `409` on stale rev **or held lock** |
| `POST` | `/brief/:id/approve` | `{ rev, only?, force? }` | `{ ok, posts, drafts }` (§9) |
| `POST` | `/brief/:id/abandon` | `{ rev }` | Marks abandoned |
| `GET` | `/briefs` | | Resumable sessions, newest first, transcripts stripped, drafts summarised |

`POST /plan` is unchanged: automation path, escape hatch, and §13 baseline.

---

## 11. The app

`src/app.js` gains a Chat tab; the Make tab's brief textarea retires into it. Queue
untouched. A **Quick plan** disclosure on the Chat view keeps one-tap `POST /plan` alive
without a second tab.

- **Brief card**, sticky under the header: Idea, Proof, Shows product, Posts. Muted for
  inferred, full ink for confirmed. Glanceable agreement.
- **Transcript.** Bubbles; the existing dark chrome suits it.
- **Draft cards** inline where produced: headline in Inter ExtraBold, eyebrow, block list,
  caption behind "Show all", any budget warnings as a quiet amber line. Per card:
  `Approve` and `Change this`.
- **Composer** fixed at the bottom: text, send, and a feature-detected
  `webkitSpeechRecognition` mic (about fifteen lines, Safari on iPhone is the target).
  Chips above the field when the last assistant turn carried `options`.
- **Approve all** when status is `ready`; force behind a confirm.
- **Session id in `localStorage`**, same as the existing API key. Without it, closing the
  app orphans an unguessable session. This is why `GET /briefs` is Phase 4, not Phase 5.
- **409 handling:** re-`GET`, replace local session, toast. For a held lock the toast says
  "still working on your last message" rather than an error.

No build step, no framework, one template literal, vanilla DOM, `fetch`. The chat view is
a list render and a form.

---

## 12. Guardrails

**Interrogation.** Two questions per turn; only three askable slots; stated best guess for
everything else; `force` approve available whenever drafts exist.

**Drift from design rules.** The chat model never writes a spec. Every spec comes from
`planPosts` / `validatePlan`; `compose()` enforces the block limit again independently.

**Invented proof.** `proof.kind` required; `composeBriefText` states availability in words;
`none` forbids stat and quote blocks explicitly.

**Theme drift.** Server overwrite after every planner and edit path.

**Copy overflow.** `checkBudgets` on every path that mutates a spec (§5).

**Parallel tool calls.** All results in one user message (§7).

**In-flight second message.** Turn lock with a 120-second stale steal (§6).

**Double submit.** `rev` on mutating calls; UI reloads on 409.

**Transcript growth.** Cap 40 turns. Past 24, summarise the oldest half into one system
note — **after a successful turn, never inline before one**, so a summarisation failure
can never cost you your message. The brief is memory; the transcript is audit.

**Lost sessions.** `localStorage` plus `GET /briefs`. Sweep `open|drafted|ready` older
than 14 days to `abandoned` on read.

**Runaway loop.** Hard cap 6 tool calls per turn; on cap, flush a plain assistant message
with current state.

**Planner failure.** Catch, return the error as a tool result, allow one in-loop retry,
then surface in chat. The session survives a bad model response.

**Partial approve failure.** Persist successes, return error, retry skips `postId`s.

---

## 13. The success gate

**This is the largest gap in v1 and v2 and it goes here, in the phases, not in the
open-questions section.** The premise of the whole feature is that conversation produces
better posts. Nothing in either plan could ever tell you it didn't.

**Fixtures.** Six briefs, taken from real ones already used (the `note` field on queued
posts is the record). They must span the cases: two with a real figure available, two with
none, two where the product is shown.

**Method.** Run each through `POST /plan { create: false }` (baseline) and through the
chat flow to `declare_ready`. Score every produced post on four binaries:

| # | Criterion | Which path should win |
|---|---|---|
| 1 | Theme correct per `themeRule` | Chat, by construction |
| 2 | No invented figure, quote, or customer | **Chat, the primary claim** |
| 3 | Block choice defensible for the argument | Neither, must not regress |
| 4 | All copy within budget | **Chat, the secondary claim** |

Plus one count: **corrections needed before you would approve**.

**The gate.** Chat must beat baseline on 2 and 4, and must not regress on 1 or 3. If it
does not, **stop at Phase 3, keep `POST /plan`, and do not build the app.** Phases 0 to 3
are the falsifiable part; Phase 4 is the investment that only pays if the gate passes.

Criterion 1 is nearly free given server-enforced theme, so treat it as a smoke test rather
than evidence. Criterion 2 is the one that matters: it is the difference between a post
that argues from reasoning because you had no figure and one that argues from reasoning
because nobody asked.

---

## 14. Rollback

Neither plan had one. Phase 4 retires the Make tab into Chat, and if the gate passed but
the thing turns out to be annoying in daily use, there is no path back.

**`BRIEF_ENABLED`**, default off. When off: the Chat tab is not rendered, the Make tab
stays exactly as it is today, and the `/brief*` routes return `404`. It is an `if` in
`appHtml` and a guard in the router, and it makes the whole feature reversible with a
Railway env change and a redeploy, no revert.

Set it on once Phase 4 is in use and you are happy. Delete the flag when the Make tab
goes for good, not before.

---

## 15. What changes in existing files

| File | Change | Size |
|---|---|---|
| `src/lib/planner.js` | Extract validation (165-213) into `export function validatePlan(plans, brand)` returning `{ posts, warnings }`. Add `export function checkBudgets(spec, brand)` (§5) and `blockNamesForPrompt()`. Raise `max_tokens` to 16000, set `thinking` explicitly (§8). | Small, plus one real fix |
| `src/lib/brief.js` | **New.** Session store, turn lock, `composeBriefText`, turn loop, tool defs, status transitions, approve. | ~420 lines |
| `src/lib/brief-log.js` | **New.** Structured one-line logs. | ~30 lines |
| `src/server.js` | Six routes, same pattern as `/posts`, behind `BRIEF_ENABLED`. | ~80 lines |
| `src/app.js` | Chat view, brief card, draft cards, composer, chips, mic, 409 handling, localStorage session, Quick plan disclosure, all behind `BRIEF_ENABLED`. | ~290 lines |
| `src/lib/posts.js`, `src/compose.js` | None. | None |
| `package.json` | Add `"test": "node --test"`. **Delete the dead `"render"` script** (§0). | Trivial |
| `test/*.test.js` | Pure tests (§16). | ~170 lines |
| `README.md` | New routes, the flag, the flow. | Small |

`POST /plan` and `POST /render` keep their contracts. The planner's token settings change,
which is a behaviour change and the point of it.

---

## 16. Build phases and tests

**Phase 0. Extract and fix the baseline.** `validatePlan` out of `planPosts`. Raise
`max_tokens`, set `thinking` explicitly. Confirm `/plan` output shape is unchanged and
**measure count-5 reliability before and after** — this is the baseline the gate depends
on, so it has to be stable first. Lands alone.

**Phase 1. Session store.** `briefs/` in R2: create, read, patch with rev, take and steal
the lock, abandon. No model. Curl plus pure tests against an injected store.

**Phase 2. Turn loop, no drafting.** `update_brief` only, plus assistant text with
`options`. **Prompt caching goes in here**, with the cache-read assertion (§8). At the end
of this phase you can hold a conversation over curl that fills the three required slots.
That alone proves the hard part.

**Phase 3. Drafting, approve, and the gate.** `draft_posts`, `revise_drafts`, `edit_draft`,
`declare_ready`, `approve` with partial and mid-batch failure. `checkBudgets` wired in.
Then **run §13**. Do not start Phase 4 until it passes.

**Phase 4. The app.** Chat view, brief card, draft cards, chips, mic, `GET /briefs` resume,
`BRIEF_ENABLED` off by default.

**Phase 5. Polish.** Transcript summarisation, the 14-day sweep, complete log fields.

Phases 0 to 3 are the feature and the proof. 4 makes it usable from a phone. 5 is tidying.

### Automated tests, required before Phase 3 is done

`node --test`, no Chromium, no Anthropic.

| Test | Asserts |
|---|---|
| `composeBriefText`, three proof kinds | Exact substrings; `none` forbids stat/quote |
| `composeBriefText`, both product flags | Theme sentence matches |
| `composeBriefText` emits no COUNT | Guards the §4 fix |
| `validatePlan` drops unknown blocks and bad screenshots | Warnings plus filter |
| `validatePlan` enforces the block limit | 3 non-cta becomes 2 |
| `checkBudgets` on a 14-word headline | Warning with field, words, budget |
| `checkBudgets` on display mode | Uses `budget.display`, not `budget.headline` |
| `mergeBrief` rejects a bad `proof.kind` | Error, no mutation |
| `ready` then `edit_draft` | Demotes to `drafted`, clears `readyAt` |
| Approve idempotency | Draft with `postId` skipped |
| Approve cap | 4 targets errors, none rendered |
| `assertRev` mismatch | 409 path |
| `assertLock` held / stale | 409 when fresh, steal when over 120s |
| Theme enforce | `showsProduct` true gives dark regardless of planner output |
| Draft id stability | Approve d1, revise, new ids, d1 untouched |
| Tool batch | Two `tool_use` blocks produce one user message with two results |

---

## 17. Locked decisions

1. **`count` is never asked.** Default 2; "just one" updates the slot via `update_brief`.
2. **No mid-conversation render.** Drafts are text; the spec is deterministic enough that
   everything variable is visible. Revisit only if textual drafts prove untrusted.
3. **Voice input ships in Phase 4**, feature-detected.
4. **Many concurrent sessions per brand**, `GET /briefs` to resume.
5. **No vision on queue images in v1.** Caption dedupe stays inside `planPosts`.
6. **Quick plan escape stays** as a disclosure, not a second tab.
7. **`ask` is message shape, not a tool.**
8. **Chat on Opus 5, planner on `COPY_MODEL`.** (§8)
9. **Caching in Phase 2, not Phase 5.** (§8)
10. **`BRIEF_ENABLED` defaults off.** (§14)

---

## 18. Observability and security

One JSON line per event on stdout, which Railway collects:

```
brief.turn.start   { id, rev, brand }
brief.tool         { id, tool, ok, ms, warnings }
brief.turn.end     { id, rev, status, ms, tools, cacheRead }
brief.ready        { id }
brief.approve      { id, count, ok, ms, postIds }
brief.lock.stolen  { id, heldMs }
brief.error        { id, where, message }
```

`cacheRead` on `turn.end` is `usage.cache_read_input_tokens`. Zero on a second turn means
the prefix is varying and caching is silently off — the cheapest possible detector for
§8's failure mode.

Security: the same `x-api-key` gate on every `/brief*` route; session id is a bearer token,
so keep it out of any log beyond the lines above; `GET /briefs` strips transcripts; `force`
cannot render invalid drafts; never log transcript bodies or `proof.detail`; README states
that `RENDER_API_KEY` must be set in production, which is already true of `/plan`.

---

## 19. Claims worth attacking

1. **Option C over B.** If interview-then-delegate is worse than one model holding full
   context, the machinery is wasted. §13 is the test, and it is a gate, not a note.
2. **Three askable slots.** If `showsProduct` is reliably inferable from the words you
   already used, the interview gets shorter and better. Do not drop it before the gate has
   data.
3. **The two-key handshake.** `declare_ready` is load-bearing because it forces the model
   to stop asking and present drafts; without it the interrogation guard is prompt-only.
4. **Budget warnings, not failures.** A 14-word headline still renders, just badly. If you
   would rather `edit_draft` refuse outright, that is a one-line change and a defensible
   different call.
5. **A 120-second lock timeout.** Long enough for a chat turn with a nested planner call,
   short enough not to strand you. Not measured.
6. **One planner call per message turn.** Trades revise-in-one-breath for not timing out.
7. **Synchronous approve capped at 3.** A workaround for a proxy timeout, not a fix. Good
   enough for a single-user phone tool.
8. **24-turn summarisation threshold, 40-turn cap.** Still guesses. §8 at least establishes
   they are about attention rather than cost.

Assumptions not defended: that R2 latency is invisible behind an Anthropic call that
already takes seconds; that single-user means the lock plus `rev` is sufficient
concurrency; that the existing planner prompt is good and this feature is about feeding it
better input rather than improving it.
