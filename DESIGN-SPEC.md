# DriverTrack social design spec

The rules for square social graphics. Locks the shell that never changes, sets the
type scale from evidence, and defines the blocks that compose underneath.

Version 2, 2 August 2026. Replaces version 1, whose reasoning was wrong even though
its numbers were roughly right. The correction is documented below because the
justification matters as much as the outcome.

---

## 1. What version 1 got wrong

Version 1 claimed a 1200px graphic renders at about 380px on a phone, a 3.2x
downscale, so 19px type displayed at 6px. That confused CSS pixels with physical
pixels. An iPhone 15 has a 393px logical viewport but a device pixel ratio of 3, so
the physical width is 1179px. A 1200px export is therefore drawn almost one to one
onto the physical grid. Nothing is being thrown away.

The type was still too small. But the reason is not downscaling, it is **angular
size**: how much of your field of view a character occupies at arm's length. That is
the measure the standards actually use, and it produces a defensible scale rather
than an invented multiplier.

---

## 2. How the type scale is derived

A 1200px graphic fills roughly 71.6mm of a phone screen, so one canvas pixel is about
0.06mm. At a typical viewing distance of 350mm, cap height converts to an angle.

ISO 9241-303:2011 sets the thresholds: minimum character height of 16 arc minutes,
recommended 20 to 22. Converted to Inter font sizes on our canvas:

| Threshold | Font size on a 1200px canvas |
|---|---|
| 16 arc min, absolute minimum | 38px |
| 20 arc min, recommended low | 47px |
| 22 arc min, recommended high | 52px |

Against that, the version 1 sizes were genuinely failing. `sm` at 19px subtends 8.1
arc minutes and `base` at 23px subtends 9.8, both around half the legal minimum for a
display standard. That is why you were zooming, and the maths now says so honestly.

A second, independent floor comes from LinkedIn re-encoding uploads, which softens
thin strokes. Practitioner guidance is to keep readable text above roughly 24px at
final export size. Our scale clears that comfortably.

---

## 3. The type scale

All sizes are final, on the 1200px canvas. There is no multiplier and no separate
"rendered" size. What you set is what ships.

| Role | Size | Arc min | Use for |
|---|---|---|---|
| `label` | 44px | 18.7 | Tags, status pills, timestamps. Glanceable only, never a sentence. |
| `small` | 52px | 22.2 | Secondary detail inside a block. |
| `body` | 60px | 25.6 | The supporting sentence under the headline. |
| `subhead` | 80px | 34.1 | Block headings, row names. |
| `headline` | 112px | 47.7 | The main line. The thing that stops the scroll. |
| `display` | 152px | 64.8 | A statement filling the frame, no body copy. |
| `stat` | 224px | 95.4 | One dominant number. |

Nothing below `label` may carry text a reader is expected to read.

**Copy budgets** on a 1200px canvas with 64px margins:

| Element | Chars per line | Max lines | Budget |
|---|---|---|---|
| Headline (112px) | ~18 | 3 | **9 words** |
| Display (152px) | ~13 | 3 | **6 words** |
| Body (60px) | ~35 | 3 | **18 words** |
| Small (52px) | ~41 | 2 | **14 words** |

If copy does not fit, cut the copy. Never shrink the type.

---

## 4. The locked shell

Identical on every graphic. Not decisions the generator gets to make. This is the
distinctive-asset discipline: Ehrenberg-Bass work on brand codes shows consistency of
a small set of assets drives recognition, and Jenni Romaniuk warns explicitly against
refreshing them, which turns a long-term investment into a seasonal fashion item.

**Ground.** White `#FFFFFF` with the tinted gradient field in the lower frame, easing
through `#DBEAFE` to `#F5F5F6`. Every post. This is a distinctive asset, so it does
not vary.

**Logo.** Top right, 100px tall, accent version. Clear space equal to the height of
the mark on all four sides.

On size: the evidence does not support making the logo dominant. Google's ABCD
framework says optimise placement for the objective rather than enlarge, Meta guidance
says lead with the benefit rather than the logo, and Romaniuk's work explicitly rejects
the "brand equals logo" trap, finding no correlation between branding scores and how
often a brand is named. 100px is 8% of the canvas width: recognisable at a glance,
still subordinate to the message. That is up from 78px, which was too quiet, but it
does not become the loudest thing on the card.

**Eyebrow.** Top left. Blue diamond `#2563EB`, 20px, rotated 45 degrees, then the
label in Inter Bold at `label` size, uppercase, tracking 0.08em, colour `#5A5A63`.

The diamond is the fluent device. System1 and the IPA found campaigns with a recurring
fluent device are 73% more likely to report a large profit gain, across 300+ IPA
Databank campaigns. It appears in the same place, at the same size, on every graphic,
forever.

**Headline.** Directly under the eyebrow. Inter ExtraBold at `headline` size, tracking
-0.028em, colour `#111113`, left aligned, three lines maximum.

**Margins.** 64px all sides. Nothing crosses it.

**Accent discipline.** Blue appears exactly twice: the diamond and one other element,
normally the call to action. Status colours (pass green, fail red) are exempt because
they carry meaning rather than emphasis.

**Type.** Inter only. Contrast through weight, never a second family. Tabular figures
on every number.

---

## 5. What varies: the blocks

Everything below the headline. Composed to suit the argument rather than chosen from a
fixed layout. Each block is styled entirely from the tokens above, so composition
cannot drift off brand.

| Block | What it is | Use when |
|---|---|---|
| `body` | One supporting sentence | Almost always, unless the headline stands alone |
| `rows` | Stacked cards: name, detail, status pill | Several people or items with outcomes |
| `compare` | Two columns side by side | Contrasting two things, showing a decision |
| `stat` | One dominant number with a label | There is a real figure worth leading with |
| `screenshot` | A product shot from the catalogue | The product itself is the proof |
| `points` | Short list with diamond markers | Two or three parallel facts |
| `quote` | Quoted text with attribution | Someone else's words, with permission |
| `cta` | Accent pill | Direct response. Omit for opinion posts. |

**Maximum two blocks per graphic.** Three only if one of them is a `cta`.

That limit is the single most important rule here and it comes from attention research
rather than taste. Karen Nelson-Field's work found 85% of digital ads receive under 2.5
seconds of active attention, and that memory can form in 1.5 seconds if distinctive
assets are present. Lumen's eye-tracking reaches the same place. A graphic glimpsed for
under two seconds carries one idea. Not one idea and three supporting points.

---

## 6. Rules the generator must follow

1. **One idea per graphic.** Two ideas means two posts. This is the attention limit,
   not a style preference.
2. Headline within 9 words. Display within 6.
3. Two blocks maximum, three with a `cta`.
4. Never invent a number, result, customer name or quote.
5. Never use `stat` without a real figure, or `quote` without a real quote.
6. Choose blocks for the argument, never for variety.
7. Screenshots must be a legible fragment, not a dense dashboard. A full UI at 1200px
   is unreadable and spends the attention budget on nothing.
8. If in doubt: fewer blocks, bigger type, shorter headline.

---

## 7. Contrast

WCAG AA is the floor: 4.5:1 for normal text, 3:1 for large text (18pt/24px, or 14pt
bold). Ink `#111113` on white is comfortably clear. Accent `#2563EB` on white passes.
Any white text placed on the gradient must be checked at the lightest point of the
gradient, which is where it will fail if it fails.

Note honestly: there is no credible evidence that contrast beyond the accessibility
threshold buys more attention or engagement. Clear the bar, then stop optimising it.

---

## 8. Where the evidence runs out

Stated plainly so nothing here is mistaken for fact:

- **Left versus centred alignment.** No controlled evidence either way for short social
  headlines. We use left because it is consistent and reads well at a glance. Preference,
  not evidence.
- **Whitespace.** No credible source gives a correct amount. Our margins and block limit
  are craft judgement informed by the attention data, not a measured optimum.
- **Optimal headline word count.** Not established anywhere. Our 9-word budget comes
  from what physically fits at 112px, which is a real constraint rather than a finding.
- **Logo size.** No source specifies a number for social graphics. 100px is reasoned
  from the "present but subordinate" consensus, not measured.
- **Product screenshots.** Marpipe reports light-mode UI lifting CTR 38% in B2B SaaS
  tests, but that is one vendor's client data, unverified, and possibly brand-specific.
  Treat as a hypothesis to test, not a rule.

Anything above marked as preference or hypothesis is a candidate for testing if you
ever put paid budget behind these.

---

## 9. Sources

**Primary and authoritative**
- ISO 9241-303:2011, character height minimum 16 arc minutes, recommended 20 to 22.
- MDN and web.dev on device pixel ratio, which corrects the version 1 error.
- Matthew Butterick, Practical Typography, on point size being relative to rendered size.
- Nielsen Norman Group, "Typography for Glanceable Reading: Bigger Is Better" (Laubheimer,
  2021), effects significant at p<0.01.
- WCAG 2.1 AA contrast thresholds.
- Karen Nelson-Field and VCCP Media, "Hacking the Attention Economy" (2025): 85% of
  digital ads receive under 2.5 seconds of active attention; memory possible at 1.5
  seconds where distinctive assets are integrated.
- Lumen Research eye-tracking on viewability versus actual viewing.
- Jenni Romaniuk, Ehrenberg-Bass, Building Distinctive Brand Assets, and "Seven Costly
  Sins of Brand Identity" (WARC, 2018) on resisting refresh.
- Orlando Wood and System1 with the IPA: fluent-device campaigns 73% more likely to
  report large profit gains, from 300+ IPA Databank campaigns.
- LinkedIn B2B Institute with System1: of 1,600 B2B ads shown to about 6 million people
  over four years, 75% scored one star or less on emotional measurement, contributing
  nothing to long-term share growth.
- Google ABCD framework on brand placement.

**Vendor sources, commercial interest noted**
- Marpipe on light versus dark UI in B2B SaaS creative.
- Superside on logos making their presence known without dominating.
- LinkedIn compression guidance from practitioner blogs; LinkedIn does not publish
  render widths.

**Caveats on the evidence itself**
- Attention research is drawn substantially from video and display advertising rather
  than static B2B feed posts. The 1.5 to 2.5 second figures are a reasonable proxy, not
  a direct measurement of our format.
- IPA Databank skews to larger consumer campaigns. The direction of the fluent-device
  finding should hold for B2B, since the B2B Institute replicated the emotional-over-
  rational result, but the exact percentages will not transfer to a niche SaaS product.
- The angular calculations above assume a 71.6mm screen width and 350mm viewing
  distance. Both vary by device and person. The scale has enough headroom that the
  conclusions hold across reasonable variation.
