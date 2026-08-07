# Gate fixtures

The six briefs that decide whether conversational briefing ships. Referenced by
`conversation-plan-v4.md` §13. Run at the end of Phase 3, before any app work.

**Provenance.** Written from the voice and audience in `src/tokens/drivertrack.js` and
the block catalogue, not pulled from the live queue (no R2 credentials on the dev box).
Swap in real briefs where you have them. What must survive the swap is the **trap** in
each one: the specific thing a one-shot planner gets wrong and an interview should catch.
A fixture with no trap tells you nothing, because both paths will handle it.

---

## Why these six

§13 asked for "two with a real figure, two with none, two where the product is shown".
That undercounts, because proof and product are independent axes and the spread misses
the highest-signal case entirely. The set below covers the axes that the gate's criteria
actually test:

| # | Proof | Product | Intent | What it is |
|---|---|---|---|---|
| F1 | figure, confirmed | shown, stated | direct | Control |
| F2 | none | not shown | opinion | **Invented-number trap** |
| F3 | figure, unconfirmed | not shown | direct | Uncertainty trap |
| F4 | none | not shown | opinion | Theme and cta discipline |
| F5 | none | **ambiguous** | either | Theme-derivation trap |
| F6 | quote, permissioned | not shown | direct | Quote handling, count 2 |

F2 is the fixture that matters most. If the gate showed nothing else, it would still be
worth running, because an invented DSP statistic on LinkedIn is a real problem rather
than an aesthetic one.

---

## How to run

**Baseline**, once per fixture:

```bash
curl -s -X POST "$HOST/plan" -H 'content-type: application/json' \
  -H "x-api-key: $RENDER_API_KEY" \
  -d '{"brand":"drivertrack","brief":"<brief verbatim>","count":2,"create":false}'
```

**Chat path**, `POST /brief` with the same text, then answer its questions as you
genuinely would, through to `declare_ready`. Answer honestly. Feeding it the answer you
know it wants is how you fake a pass.

Paste each brief **verbatim**. If the two paths get different words, the comparison is
worthless.

**The harness.** `scripts/gate-run.js` drives both paths against the briefs in
`fixtures/`, which are extracted from this file so the two cannot drift. Sessions go to
`gate-runs/` on disk rather than R2: the gate stops at `declare_ready`, so nothing here
renders, needs Chromium, or touches production. Only `ANTHROPIC_API_KEY` is needed.

```bash
node --env-file=.env scripts/gate-run.js baseline          # all six, unattended
node --env-file=.env scripts/gate-run.js chat f2           # start the chat path
node --env-file=.env scripts/gate-run.js say f2 "no, no figure"   # one honest answer
node --env-file=.env scripts/gate-run.js score f2          # C2 and C4, both paths
```

The chat path takes one message per invocation on purpose. Answering honestly is a
requirement of the method, not a formality, so the answers have to come from a person
one turn at a time rather than from whoever is running the harness.

`score` runs `gate-check.js` over both files: every quantity in the post that is not in
the brief, with the words around it, plus any copy over budget. It does not tell
`gate-check` which path produced what. C1 and C3 you score by hand, and C3 blind.

---

## F1 — control

```
Post about the overnight screening. Figure I can use: 40 applicants went through it in
one night and 11 were booked in for interview by Monday morning. That's confirmed, we
can quote it. Show the screening thread.
```

**Tests:** the happy path, where nothing is missing.

**Trap:** mild. Everything the planner needs is stated, so both paths should do well.
Watch whether the figure actually reaches the graphic as a `stat` block or gets buried
in the caption while the headline says something vague.

**Good looks like:** dark theme, the figure used exactly (40 and 11, not "dozens" or
"over 10"), `thread` or `stat` carrying it, a cta.

**If chat loses here, stop.** A brief with nothing missing is where the interview adds
least and can only add friction. Losing on F1 means the conversation is actively getting
in the way.

---

## F2 — the invented-number trap

```
Do one about the time owners lose to callbacks. Ringing round applicants who never
answer, leaving voicemails, doing it again the next evening. It eats a huge chunk of
the week.
```

**Tests:** criterion 2, the primary claim of the whole feature.

**Trap:** "a huge chunk of the week" is a quantity-shaped phrase with no quantity in it.
The prompt already forbids inventing a statistic, but the brief is *asking* for one
without supplying it. Expect the baseline to produce "8 hours a week", "a full day", or
a `stat` block with a made-up percentage. It will read plausibly, which is the danger.

**Good looks like:** the interview asks whether there is a real figure, is told no, and
the post argues from the described experience. Light theme, no `stat` block, no number
anywhere in the headline, caption, or first comment.

**Score strictly.** "Hours every week" is an invented quantity. So is "most of an
evening". If it did not come from the brief, it is invented.

---

## F3 — the uncertainty trap

```
Something for peak. Last December was carnage, I think applications roughly tripled in
the first fortnight but don't hold me to that. Worth saying something about getting
ahead of it.
```

**Tests:** whether the interview surfaces *doubt*, not just presence or absence.

**Trap:** a figure is offered and immediately disclaimed. `proof.kind` is genuinely
undecided here and only you can settle it. The baseline has no way to ask, so it will
almost certainly print "tripled" as fact.

**Good looks like:** the interview asks whether "roughly tripled" is confirmed. When
told no, the figure disappears entirely rather than being softened to "surged" while
keeping the shape of a claim.

**Watch for laundering.** "Applications more than doubled" is worse than "tripled",
because it looks like a checked figure and is not. Score any unsourced quantity as a
criterion 2 failure regardless of hedging.

---

## F4 — theme and cta discipline

```
I keep seeing owners treat hiring like a seasonal emergency rather than something that
just runs. That's the actual problem, not the applicant pool. Make that point.
```

**Tests:** criteria 1 and 3 on a post with no product in it.

**Trap:** this is an opinion. Per `themeRule` it must be **light**, it should carry no
`cta`, and it is a strong candidate for `display: true` with the headline filling the
frame. Baselines drift toward dark (it feels more "product") and bolt on a cta out of
habit. It will also be tempted to invent a churn statistic.

**Good looks like:** light, no cta, one idea, ideally display mode. Nothing about
screening features.

**Note:** theme is server-enforced in the chat path, so criterion 1 is nearly free
there. Treat a chat win on C1 as a smoke test, not evidence. The cta and display
decisions are the real signal here.

---

## F5 — the theme-derivation trap

```
Do one about setting the screening questions once and then not thinking about them
again. Set it up in an afternoon, it just runs after that.
```

**Tests:** criterion 1 where the answer is genuinely unknowable from the brief.

**Trap:** this could be a product demonstration (dark, screenshot or thread) or a
statement about how hiring admin should work (light, no product). Both are defensible.
The brief does not say, and neither path can infer it. The baseline picks one and you
find out when the PNG appears.

**Good looks like:** the interview asks "does this one show the product?" — not "light
or dark?" — and derives the rest. Whichever you answer, the theme, the block choice, and
the presence of a screenshot should all follow from it consistently.

**Score this one on coherence, not on which theme.** A light post with a screenshot
block, or a dark post with no product in it, is a failure. Either answer, cleanly
carried through, is a pass.

---

## F6 — quote handling, and count

```
Got permission to use a line from a call with an owner, they said "I used to spend
Sunday nights ringing round". No name, they don't want naming. Two posts off the back
of that if you can.
```

**Tests:** the quote path, the naming rule, and `count` without asking.

**Traps, four of them:**

1. The `quote` block is legal here and should be used for one of the posts.
2. The voice rules forbid naming a customer. Attribution must stay anonymous — "a DSP
   owner", not an invented name or company.
3. **There is only one real quote and you asked for two posts.** The second post has no
   quote and must argue some other way. Watch for a fabricated second quote, or a
   `stat` block appearing from nowhere to fill the gap.
4. `count` is stated in the brief. The chat path should pick it up via `update_brief`
   and never ask about it.

**Good looks like:** post one uses the quote verbatim with anonymous attribution; post
two makes a different argument with no invented proof of any kind; neither names anyone;
the conversation never asks how many posts you want.

---

## Scoring

Score every **post produced**, not every brief. Six briefs at count 2 is roughly twelve
posts per path.

| # | Criterion | Pass means |
|---|---|---|
| C1 | Theme correct | Matches `themeRule` given what the post actually shows |
| C2 | No invented proof | No figure, quote, customer, or quantity absent from the brief |
| C3 | Block choice defensible | The blocks serve the argument, not variety |
| C4 | Copy within budget | Headline ≤9 words (≤6 in display), body ≤18, small ≤14 |

Plus, per brief: **corrections you would need before approving**. Count a correction as
any change you would ask for, however small.

### What counts as invented — settled 7 August 2026

**Sample content inside a `thread` block is not an invented-proof failure.** A thread is
a mockup of the product working, not a claim about results: "Q4 of 5: full UK licence
with no more than 6 points" is illustrative, the same way a screenshot is. Both paths
produce it, so counting it would penalise them equally and tell you nothing about the
thing the gate is measuring.

Everything outside the block still counts, including the caption and first comment. A
figure that escapes the thread and gets asserted as fact in prose — "an applicant
answered five questions at 11pm on a Sunday" — is a C2 failure like any other.

This ruling decides F1 and F5, where the raw quantity count otherwise favours the
baseline purely because its threads are shorter.

### Score C3 blind

C1, C2 and C4 are mechanical — you can count words and spot a number. C3 is a judgement
call, and it is the one criterion where knowing which path produced a post will flatter
the new thing. Strip the labels, shuffle the posts, score them in one pass, then
re-associate. It costs five minutes and it is the difference between a gate and a
ceremony.

### The gate

Chat must **beat** baseline on C2 and C4, and must **not regress** on C1 or C3.

If it does not: stop at Phase 3, keep `POST /plan`, do not build the app. Phases 0 to 3
are the falsifiable part; Phase 4 is the investment that only pays if this passes.

## Gate result, 7 August 2026 — C1, C2, C4 scored; C3 outstanding

All six fixtures run through both paths, chat driven to `declare_ready` on each.
Raw output in `gate-runs/`.

**C2 — no invented proof. Chat wins 4–1, one wash.**

| | Baseline invented | Chat invented | |
|---|---|---|---|
| F1 | "Half your applicants won't answer", "five questions land by text" | "people apply to three jobs at once", "answered five questions at 11pm" | wash |
| F2 | "four go straight to voicemail", "the same six numbers" | "five questions" (product mechanism, not a result) | **chat** |
| F3 | clean — avoided "tripled" | "they apply to three or four ads in an evening" | baseline |
| F4 | "fifty pence more an hour", "six weeks later", "month two" | "the eight weeks before it", "waits three days" | **chat** |
| F5 | "three drivers short before peak" | clean | **chat** |
| F6 | "screening forty applicants by hand" — a figure from F1's brief | clean | **chat** |

F2, F4 and F6 carry the strongest invention traps and chat took all three. F2 is the
fixture the feature was designed around and it held: the interview asked whether a figure
existed, was told no, and the post argued without one.

**C4 — copy within budget. Chat wins 12–8.** Baseline put 4 of 12 posts over the display
budget. Chat put **none** over, on any fixture. The revision loop needed two passes on F2
(9 words, then 8, then 5 against a budget of 6) rather than converging first time.

**C1 — theme. Chat REGRESSES, 3 failures against baseline's 1.** Every chat failure is
the same shape: a `display` post forced dark. `display` carries no blocks by definition,
so the post shows no product, but `showsProduct` is one boolean for the whole brief and
`enforceTheme` stamps dark on every draft in the batch.

| | Baseline | Chat |
|---|---|---|
| F1 | 1 fail (dark, stat+cta, no product) | 1 fail (same) |
| F2 | 0 | 1 fail (dark display, no product) |
| F3 | 0 | 1 fail (dark display, no product) |
| F4, F5, F6 | 0 | 0 |

F6 is the same bug in its other form: the brief asked for one product post and one
statement post, and a single boolean cannot express that. It took two separate sessions
to produce the pair, and the model correctly reported it could not fix the theme rather
than claiming it had.

### Verdict

**The gate does not pass as it stands.** The rule is beat baseline on C2 and C4 *and*
do not regress on C1 or C3. C2 and C4 are decisive wins. C1 is a regression.

The regression has one cause, not many: `showsProduct` is per brief, theme is per post.
Fixing it means deriving theme from what each draft actually contains — a product block
present or absent — rather than from a brief-level flag, and letting a batch hold both
kinds. That is a contained change to `enforceTheme` and the brief shape, not a rethink of
the architecture.

So the premise survived and the build has a defect. Phase 4 stays shut until C1 is fixed,
C3 is scored, and the affected fixtures are re-run.

### Scoresheet

| Fixture | Path | Posts | C1 | C2 | C3 | C4 | Corrections |
|---|---|---|---|---|---|---|---|
| F1 | baseline | | | | | | |
| F1 | chat | | | | | | |
| F2 | baseline | | | | | | |
| F2 | chat | | | | | | |
| F3 | baseline | | | | | | |
| F3 | chat | | | | | | |
| F4 | baseline | | | | | | |
| F4 | chat | | | | | | |
| F5 | baseline | | | | | | |
| F5 | chat | | | | | | |
| F6 | baseline | | | | | | |
| F6 | chat | | | | | | |
| **Total** | | | | | | | |

---

## Baseline result, 5 August 2026

F1 and F2 run through the current planner at count 2, `create: false`. This is the
number the chat path has to beat.

### F2 — fabricated, as predicted

| Where | Text | Why it fails C2 |
|---|---|---|
| Headline, post 1 | "The callback round costs you an evening" | Brief said "a huge chunk of the week". "An evening" is a quantity the brief never gave, in the largest type on the card. |
| Caption, post 1 | "Same five names on the list" | Invented specificity. |
| First comment, post 2 | "What would you do with five hours back this week?" | A benefit claim with a number attached. Nothing supports five hours. |

**C4 also failed, and this is the more useful finding.** Post 1 ran `display: true`,
where the budget is six words. The headline is seven. The planner had that budget in its
prompt and broke it anyway — so prompt-stated budgets do not hold even on the path that
is told about them. This is what moved `checkBudgets` into Phase 0.

Post 1 was light and display, post 2 dark with `thread` + `cta`: the planner split one
brief into an opinion post and a product post. Defensible, but note the brief never asked
to show the product. That pivot is the kind of thing F5 is designed to catch.

### F1 — clean

Both posts used the real figures correctly. Post 2's `stat` block came out as
`value: "11"`, `unit: "interviews booked"`, `label: "from 40 applicants screened
overnight"`. Headlines 7 and 8 words against a 9-word budget. Both dark, as the theme
rule requires for a product post.

One unresolved token: a stray "ten minutes" in post 2's caption that may or may not be
an invented duration. Not chased, because a re-run produces a different sample and would
not answer it.

### Matcher fixed, 7 August 2026

The quantity check compared tokens literally, so it did not know `40` and `forty` were
the same number, and it flagged F1's legitimate figures as inventions. Every
figure-carrying fixture would have shown the same false positives.

Now in `src/lib/quantities.js`, with `scripts/gate-check.js` over it and tests in
`test/quantities.test.js`. Both sides normalise to numeric values before the set
difference, so `forty`, `40`, `5,000`, `five thousand`, `10k`, `twenty-five` and
`a hundred and twenty` all compare as numbers. Re-run against the 5 August output: F2
still flags both fabrications and the seven-word display headline; F1 comes back clean
apart from the "ten minutes" that was already unresolved.

Three limits, stated so the scoring stays honest:

- **It does not decide what counts as a quantity.** "one of the reasons" and "one night"
  both normalise to 1. Output is a candidate list carrying the surrounding words, and
  you make the call. Ordinals are excluded outright, because mapping "the first thing"
  to 1 is what would put the false positives back.
- **Vague phrases are never subtracted.** F2's brief says "the next evening" (a time of
  day) and its post says "costs you an evening" (a duration). Only the second is an
  invention and no matcher separates them, so phrases like these are always surfaced
  and always judged by hand.
- **It covers C2 and C4 only.** C1 and C3 stay manual, and C3 stays blind.

### What this settles

The feature's primary claim survives contact: given a brief that asks for a quantity
without supplying one, the current planner invents one, in the headline and in the first
comment. There is a real target to beat. The gate is worth running.
