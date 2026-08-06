# Conversational briefing

A build plan for the app's brain. Today you put a brief in and posts come out. This
replaces that with a conversation that runs until both sides agree what is being made,
and only then renders.

Status: **plan only, nothing built**. Written to be reviewed before any code is
written.

---

## 0. For a reviewer without the repo

The service is a small Node 20 HTTP server (`node:http`, no framework) that renders
1200x1200 PNG social graphics with headless Chromium and stores them in Cloudflare R2.
There is no database. R2 holds JSON objects as well as images.

The four pieces that matter here:

| File | What it does |
|---|---|
| `src/server.js` | Hand-rolled router. `POST /plan`, `POST /render`, `/posts/*`, `/shots/*`, `GET /` serves the app. |
| `src/lib/planner.js` | `planPosts()`. One Anthropic call, brief in, array of finished posts out. |
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

The design rules that constrain everything are in `DESIGN-SPEC.md`: one idea per
graphic, two blocks maximum (three only if one is a `cta`), fixed type sizes with word
budgets, a locked shell the generator does not get to touch, and a theme rule that is a
rule rather than a preference (dark shows the product, light is for statement posts).

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

The prompt sent to the model already carries the brand voice, the audience, the block
catalogue with a `useWhen` line each, the screenshot catalogue, the copy budgets, the
hard constraints, and the last 12 queued posts so it does not repeat an angle.

That prompt is good. The problem is not the prompt. The problem is that it is fired
once, blind, with no chance to ask anything.

### What actually goes wrong

1. **The model guesses at the one thing it must not guess about: proof.** The
   constraint is absolute, "never invent a statistic, result, customer name or quote".
   So when the brief does not supply a figure, the model quietly falls back to arguing
   from reasoning, and you get a weaker post than the one you could have had if it had
   simply asked "do you have a real number for this?".

2. **The theme rule is derived from a fact nobody stated.** Dark if the post shows the
   product, light if it does not. The brief rarely says. The model picks, and half the
   time it picks wrong, which undoes exactly the recognition that consistent assets are
   supposed to build.

3. **Rejection is total.** If the angle is wrong, you reject and rewrite the brief from
   scratch. Everything the model got right is thrown away with the part it got wrong.

4. **Rendering is the expensive step and it happens first.** `create: true` composes and
   pushes a PNG per post before you have seen a single word. Chromium launch plus an R2
   upload, times the count, to produce something you might bin on the headline.

5. **You cannot say "not that, this".** There is no channel for a correction that is
   smaller than a whole new brief.

---

## 2. What "on the same page" has to mean

This is the load-bearing decision in the whole plan, so it goes first.

Agreement on a feeling is not checkable. If the conversation converges on nothing more
than mutual good vibes, the render is still a surprise, and we have added five minutes
of chat for no gain. So the conversation must converge on **two concrete artefacts**,
both visible to you at all times:

**The working brief.** A structured object, not prose. It accumulates as the
conversation goes and is rendered in the UI as a small card you can read at a glance.
It holds the decisions, not the chat.

**The drafts.** The actual posts, as text, before any pixel is rendered. Headline,
eyebrow, which blocks and their content, caption, first comment. This is what you are
agreeing to. Rendering is then a mechanical consequence of an agreement already reached,
not the moment of truth.

And agreement itself is a **two-key handshake**:

- The assistant turns its key by calling `declare_ready`. It may only do that when every
  required slot in the working brief is resolved and drafts exist.
- You turn yours by approving.
- Render needs both keys.

With one deliberate exception, stated here because it is a requirement rather than an
oversight: **you can always override.** `approve` with `force: true` renders whatever is
on the table even if the assistant has not declared ready. The assistant can decline to
declare ready, but it can never hold the work hostage behind more questions. The reverse
is not true. The assistant declaring ready renders nothing on its own.

---

## 3. Architecture: three options, one recommendation

Where do the finished specs actually get written? Three answers, and the choice
determines everything else.

### Option A: conversation refines the brief, planner unchanged

The chat is a front end that produces a better brief string. When you approve, the
existing `planPosts()` runs exactly as it does now.

- Cheap. Barely touches existing code.
- **Fatal flaw: you never agree to the posts, only to the brief.** The planner still
  re-rolls at the end, so the headline you approved is not the headline that renders.
  That is the same surprise we are trying to remove, just later in the flow.

Rejected.

### Option B: the conversation writes the specs itself

The chat model holds the whole planner prompt and emits specs directly as it goes.

- What you agree to is exactly what renders.
- The full block catalogue with shapes, budgets, voice and constraints has to ride along
  in every turn. Prompt caching makes that affordable but it is still the planner's job
  duplicated in a second place, and the two will drift.

Viable fallback, not the recommendation.

### Option C, recommended: the conversation calls the planner as a tool

The chat model is a **producer**, not a copywriter. It interviews you, keeps the working
brief, and when it has enough it calls the existing planner as a tool with
`create: false`. The planner returns real specs. The chat model presents them as text,
takes your critique, and either re-plans or edits a specific field. Approve renders the
exact drafts on the table.

Why this one:

- **One place knows the design rules.** Block shapes, copy budgets, validation, the
  screenshot catalogue, the recent-posts dedupe: all of that stays in `planner.js`. The
  conversation never learns it and so can never contradict it.
- **What you see is what renders.** The approved artefact is literally the planner's
  output, carried forward untouched.
- **The conversation prompt stays small.** It needs block names and one-line purposes so
  it can talk sensibly about what is possible. It does not need the JSON shapes.
- **Both loops are already half-built.** `planPosts({ create: false })` exists and
  returns clean posts without rendering. It was written for exactly this.

The cost is a tool-use loop in the server, which is maybe eighty lines. Worth it.

---

## 4. The working brief

Nine slots. Each one is here because getting it wrong changes the output, and no slot is
here for completeness.

| Slot | Type | Why it matters | Ask or infer |
|---|---|---|---|
| `idea` | string | The single claim. Becomes the headline. One graphic carries one. | **Always required.** |
| `proof` | `{ kind: "figure" \| "quote" \| "none", detail }` | Decides whether `stat` and `quote` are legal at all. The planner is forbidden to invent either. | **Always ask if unstated.** |
| `showsProduct` | boolean | Derives the theme by rule, and unlocks `thread` and `screenshot`. | **Always ask if unstated.** |
| `demonstration` | `"thread" \| "screenshot:<name>" \| "none"` | Which product asset carries it. | Ask only if `showsProduct`. |
| `intent` | `"direct" \| "opinion"` | Direct gets a `cta`. Opinion gets none and may run in display mode. | Infer, state the guess. |
| `count` | 1 to 7 | How many posts. | Infer 2, state it. |
| `avoid` | string[] | Angles already covered, things not to say. | Infer from the queue. |
| `schedule` | string | Goes on the post record, nothing else reads it. | Infer, never ask. |
| `notes` | string[] | Anything you said that does not fit a slot but should reach the planner. | Accumulate silently. |

Three rules on top of the table, and they are the difference between a useful
conversation and an interrogation:

**Theme is never asked about.** `themeRule` in `src/tokens/drivertrack.js` derives it:
dark shows the product, light does not. Asking "light or dark?" invites you to break a
rule the system already knows. Ask "does this one show the product?" instead.

**Only three slots are ever worth a question**: `idea`, `proof`, `showsProduct`. Those
are the ones where a wrong guess wastes a render. Everything else gets a stated
assumption. "I will do two, direct response, unless you say otherwise" beats a question,
because you can ignore it and the conversation still moves.

**Two questions per turn, maximum.** Enforced in the prompt and again in the tool
schema. A phone keyboard is the bottleneck in this whole system.

---

## 5. The session record

Stored in R2 under `briefs/{id}.json`, alongside the existing `posts/` and `renders/`
prefixes. No new infrastructure.

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
    { "draftId": "d1", "spec": {}, "caption": "", "firstComment": "",
      "altText": "", "note": "", "scheduledFor": "", "state": "open" }
  ],

  "readyAt": "",
  "approvedAt": "",
  "postIds": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Notes on the shape:

- `status` moves `open` -> `drafted` -> `ready` -> `approved` -> `rendered`, with
  `abandoned` reachable from anywhere. `drafted` means specs exist. `ready` means the
  assistant has turned its key.
- `rev` increments on every write. Every mutating request sends the `rev` it last saw
  and gets a `409` if it is stale. A phone on a bad signal will double-submit, and
  without this the second submit silently reverts the first.
- `id` from `crypto.randomUUID()`, not the `Date.now() + Math.random()` pattern in
  `posts.js`. A session id is a bearer token for the conversation, so it should be
  unguessable rather than merely unique.
- `transcript` is the human record. `brief` is the machine record. They are kept
  separate on purpose: the brief must be readable at a glance without scrolling back
  through chat, and it must survive transcript summarisation.
- `drafts[].state` is `open`, `approved` or `dropped`. Per draft, because partial
  approval matters (section 7).

---

## 6. The turn loop

One user message drives one server-side loop. Tools, not JSON parsing, because the
assistant needs to both say something and do something in the same turn, and because
a malformed JSON blob mid-conversation is much harder to recover from than a failed
tool call.

```
POST /brief/:id/message { text, rev }
  |
  load session, check rev
  append user turn
  |
  loop (max 6 tool calls):
    call Anthropic with: cached system block + transcript + brief + drafts summary
    |
    +- update_brief(patch)      -> merge into session.brief, continue loop
    +- draft_posts(count?)      -> planPosts({ create:false }), fill session.drafts, continue
    +- revise_drafts(feedback)  -> re-plan with feedback appended, replace open drafts
    +- edit_draft(id, patch)    -> patch one draft's spec/caption, re-validate, continue
    +- declare_ready(summary)   -> status = "ready", readyAt = now, stop
    +- (plain text)             -> assistant turn, stop
  |
  bump rev, write to R2, return the session
```

### The tools

**`update_brief(patch)`** — merges resolved slots. Called whenever you say something
that settles one. Silent: does not produce a chat message on its own.

**`ask(question, options?)`** — the assistant's normal reply when something is missing.
`options` is an array of up to four short answers, which the UI renders as tappable
chips. This is the single highest-value affordance in the feature. Most turns in a real
conversation are "yes", "no", "the second one", and typing those on a phone is the whole
friction.

**`draft_posts(count?)`** — calls `planPosts({ brand, brief: composeBriefText(session), count, create: false })`.
Returns the validated posts and any `warnings`. Fills `session.drafts`, sets status to
`drafted`. The assistant then summarises them in chat as text. Only callable once every
required slot is resolved, checked server-side rather than trusted to the prompt.

**`revise_drafts(feedback)`** — re-runs the planner with the previous drafts and your
feedback appended to the brief text. Replaces drafts still in `state: "open"` and leaves
approved ones alone.

**`edit_draft(draftId, patch)`** — surgical. Patches one field of one draft, then runs it
back through the same validation `planPosts` uses. For "make that headline shorter",
where re-rolling would throw away three things you already liked. This is the tool that
makes the conversation feel like editing rather than re-rolling a dice.

**`declare_ready(summary)`** — turns the assistant's key. Server rejects the call unless
drafts exist and every required slot is filled, so the model cannot declare ready out of
politeness.

### Prompt construction

System block, cached with `cache_control: ephemeral`, static across every turn of every
session for a brand:

- Role: you are the producer, not the writer. You do not write headlines. You interview,
  you keep the brief, and you call the planner when you have enough.
- Brand voice and audience, straight from `tokens/{brand}.voice`.
- Block names with the first line of each `useWhen` from `BLOCK_CATALOGUE`. **Not the
  shapes.** The shapes are the planner's business.
- The theme rule, phrased as a derivation and not a choice.
- The three hard constraints that shape the interview: one idea per graphic, two blocks
  maximum, never invent a figure or a quote.
- The conversation rules: two questions per turn maximum, always state your best guess
  for anything you are not asking about, prefer proposing to asking, stop asking once
  the three required slots are resolved.

Then, per turn: the transcript, the current working brief as JSON, and a compact summary
of the drafts if any exist.

Rough size: system block around 900 tokens, growing by roughly 150 per exchange. With
caching, a ten-turn conversation is a few pence.

---

## 7. Partial approval

Worth its own section because it is the part most likely to be dropped as a nicety and
is in fact the point.

You will routinely like two of the three drafts. Today that costs you a whole re-plan.
Under this design:

- Each draft carries its own `state`.
- `POST /brief/:id/approve { only: ["d1","d3"] }` renders those two, creates the posts,
  marks the drafts `approved`, and **leaves the session open**.
- The conversation continues about `d2` alone. `revise_drafts` only touches open drafts.
- When nothing is left open, the session moves to `rendered`.

Without this, "let's talk until we agree" collapses back into all-or-nothing, which is
what we started with.

---

## 8. API surface

Every route sits behind the existing optional `x-api-key` gate in `server.js`.

| Method | Route | Body | Returns |
|---|---|---|---|
| `POST` | `/brief` | `{ brand, text? }` | New session. Runs the first turn if `text` is given. |
| `GET` | `/brief/:id` | | The session. |
| `POST` | `/brief/:id/message` | `{ text, rev }` | Session after the turn loop. `409` on stale `rev`. |
| `POST` | `/brief/:id/approve` | `{ rev, only?, force? }` | `{ ok, posts: [...] }`. Renders and queues. |
| `POST` | `/brief/:id/abandon` | `{ rev }` | Marks abandoned. |
| `GET` | `/briefs` | | Open sessions, newest first, transcripts stripped. |

`POST /plan` **stays exactly as it is.** It is the automation path and the escape hatch,
and the new flow is built on top of it rather than replacing it. Anything scripted keeps
working.

Approve is idempotent: if `status` is already `rendered`, return the existing `postIds`
rather than rendering again. Rendering is the expensive irreversible bit and phones
retry.

### The timeout problem

`approve` composes and renders N posts synchronously through Chromium, exactly as
`POST /plan { create: true }` does now. That already runs close to proxy timeouts at
count 5. Two honest options:

1. **Accept it for now.** Cap approve at 3 posts per call, let partial approval handle
   the rest. Simplest, and partial approval means you rarely approve more than 2 at once
   anyway.
2. **Return immediately, render in the background,** and have the queue poll. Correct,
   but it adds job state to a service that currently has none.

Recommend (1) for the first build, with (2) noted as the fix if it bites.

---

## 9. The app

`src/app.js` gains a Chat tab and the Make tab retires into it. Queue is untouched.

The layout, top to bottom:

- **Brief card**, sticky under the header. The working brief as short lines: `Idea`,
  `Proof`, `Shows product`, `Posts`. Grey for inferred, white for confirmed. This is
  what makes agreement checkable without scrolling.
- **Transcript.** Standard bubbles. The existing dark chrome already suits it.
- **Draft cards**, inline in the transcript where they were produced. Headline in
  Inter ExtraBold, eyebrow above it, blocks listed underneath, caption collapsed behind
  a "Show all" like the queue card already does. Each carries `Approve` and `Change
  this`.
- **Composer**, fixed at the bottom in place of the current action bar. Text field plus
  send. When the last assistant turn carried `options`, chips sit above the field.
- **Approve all**, only once status is `ready`.

Existing constraints that shape this: no build step, no framework, one template literal,
vanilla DOM, `fetch`. Do not introduce a framework for this. The chat view is a list
render and a form.

One pre-existing bug to fix while in there: `drawQueue()` in `src/app.js:335` renders
`esc(p.template)`, and `template` no longer exists on a post. It has been dead since
templates were replaced by the composer. It shows as an empty gap in every queue card.

---

## 10. Guardrails

Each one is a failure this design would otherwise walk into.

**The interrogation.** An LLM told to "converse until aligned" will ask forever, because
asking is always locally safer than committing. Countered four ways: two questions per
turn in the schema; only three slots are ever askable; the prompt requires a stated best
guess for everything not being asked; and you can approve at any moment regardless.

**Drift from the design rules.** Twelve turns in, the chat model has read a lot of your
prose and none of `DESIGN-SPEC.md`. Countered structurally: the chat model never writes a
spec. Every spec comes from `planPosts`, which validates blocks against
`BLOCK_CATALOGUE`, drops unknown screenshots, and enforces the block limit. `compose()`
enforces it again independently. Nothing the conversation agrees to can bypass either.

**Invented proof.** The one unrecoverable error, because a fabricated DSP statistic on
LinkedIn is a real problem rather than an aesthetic one. `proof.kind` is a required slot
and it flows into the brief text as an explicit statement of what is and is not
available. If it is `none`, the brief text says so in words: no figures available, argue
from reasoning, do not use the stat or quote blocks.

**Transcript growth.** Caps at 40 turns. Past 24, summarise the oldest half into a single
system note and keep the working brief intact. The brief is the memory that matters;
the transcript is just the audit trail.

**Lost sessions.** `GET /briefs` lists open ones so a session survives closing the phone.
Sweep anything `open` and untouched for 14 days to `abandoned` on read, not on a cron.

**Double submit.** `rev` on every mutating call, `409` on mismatch, and the UI reloads
and re-sends rather than showing an error.

**A tool loop that will not end.** Hard cap of 6 tool calls per user turn. On the cap,
return what exists with a plain assistant message rather than an error.

**Planner failure mid-conversation.** `planPosts` throws on an unparseable response.
Catch it, feed the error back as the tool result, let the model try once more, then
surface it in chat as a message rather than a `500`. The session must survive a bad
model response.

---

## 11. What changes in existing files

| File | Change | Size |
|---|---|---|
| `src/lib/planner.js` | Extract the validation block (lines 165 to 213) into an exported `validatePlan(plans, brand)` so `edit_draft` can re-validate a patched draft without a model call. Export `buildPrompt` pieces the conversation needs. No behaviour change to `planPosts`. | Small, mechanical |
| `src/lib/brief.js` | **New.** Session store, turn loop, tool definitions, `composeBriefText()`. The whole feature. | ~350 lines |
| `src/server.js` | Six routes, following the existing `/posts` pattern exactly. | ~60 lines |
| `src/app.js` | Chat view, brief card, draft cards, composer, chips. Fix the dead `p.template`. | ~250 lines |
| `src/lib/posts.js` | None. `createPost` already does the right thing. | None |
| `src/compose.js` | None. | None |
| `README.md` | Document the new routes and the flow. | Small |

Nothing is deleted and nothing changes shape. `POST /plan` and `POST /render` behave
identically afterwards.

---

## 12. Build phases

Each phase is independently testable and independently useful, so it can stop after any
of them and still be ahead.

**Phase 0. Extract.** Pull `validatePlan` out of `planPosts`. Confirm `POST /plan` is
byte-identical in behaviour. No new features. This is the only change that touches
working code, so it lands alone.

**Phase 1. Session store.** `briefs/` in R2, create, read, append, `rev` checking, no
model involvement at all. Test with curl.

**Phase 2. The turn loop.** Tools, the Anthropic call, `update_brief` and `ask` only.
No drafting yet. At the end of this phase you can hold a conversation over curl that
fills in the working brief. That alone proves the hard part.

**Phase 3. Drafting.** `draft_posts`, `revise_drafts`, `edit_draft`, `declare_ready`,
and `approve`. Full flow, still over curl.

**Phase 4. The app.** Chat view, brief card, draft cards, chips.

**Phase 5. Polish.** Prompt caching, transcript summarisation, `GET /briefs` resume,
abandoned sweep, the queue-card fix.

Phases 0 to 3 are the feature. 4 makes it usable from a phone. 5 makes it cheap.

---

## 13. Open questions

Genuinely open, listed so a reviewer does not mistake a decision for an oversight.

1. **Should `count` be conversational at all?** Arguably the conversation should settle
   one idea properly, and "give me three of these" is a separate act. Leaning towards
   keeping `count` in the brief but never asking about it.

2. **Should a real render appear mid-conversation?** One rendered PNG at the point of
   `declare_ready` would make agreement genuinely visual rather than textual. It costs a
   Chromium launch and an R2 write for something you might discard. Leaning towards no
   for the first build, on the grounds that the spec is deterministic and the drafts show
   everything that varies.

3. **Voice input.** The whole point of the phone app is speed, and dictation is faster
   than typing. `webkitSpeechRecognition` in the composer is maybe fifteen lines and
   works in Safari. Cheap enough to just do it in phase 4.

4. **One session per brand, or many concurrent?** Many is more general. One is simpler
   and probably matches how it actually gets used. Currently planned as many, with
   `GET /briefs` to switch.

5. **Does the assistant get to see the rendered queue images?** It reads recent post
   captions today for dedupe. Vision on the actual renders would let it notice that the
   last four posts all used the thread block. Interesting, not phase one.

---

## 14. For the reviewer

The specific claims worth attacking, in order of how much rests on them:

1. **Option C over B.** The whole plan hangs on the chat model never writing a spec.
   If the interview-then-delegate split produces worse posts than a model that holds the
   whole context and writes directly, C is wrong and the extra machinery is wasted.

2. **Nine slots, three askable.** Is `proof` really the highest-value question? Is
   `showsProduct` better asked than inferred from the words you already used? If the
   model can reliably infer `showsProduct` from "screening runs overnight", the interview
   gets shorter and better.

3. **The two-key handshake.** Is a model-side readiness signal doing real work, or is it
   ceremony on top of a button you were going to press anyway?

4. **Partial approval.** Adds `state` to every draft and a filter to every revision path.
   Justified, or premature?

5. **The synchronous approve.** Capping at 3 posts per approve call to dodge a proxy
   timeout is a workaround, not a fix. Is it good enough for a single-user tool?

6. **The transcript summarisation threshold.** 24 turns is a guess. So is the 40-turn
   cap. Neither is measured.

Assumptions the plan makes and does not defend: that R2 is fast enough to read and write
a session on every turn without the latency being felt behind an Anthropic call that
already takes seconds; that a single user means no real concurrency beyond double-submit;
that the existing planner prompt is good and this feature is about feeding it better
input rather than improving it.
