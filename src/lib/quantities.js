// Quantity extraction for the criterion 2 scoring pass in gate-fixtures.md.
//
// C2 asks whether a post contains a figure the brief never supplied. The 5 August
// baseline run compared tokens literally, so `40` in the brief did not match `forty`
// in the post and F1's legitimate figures came back flagged as inventions. Every
// figure-carrying fixture would have shown the same false positives, which is what
// made the scoresheet unreadable.
//
// The fix is to normalise both sides to numeric values before the set difference.
// That is all this module claims to do. It does NOT decide whether a number is a
// quantity: "one of the reasons" and "one night" both normalise to 1, and no amount
// of pattern matching separates them reliably. So the output is a candidate list
// carrying the surrounding words, and the scorer makes the call in a second or two.
//
// Vague quantity phrases ("a huge chunk of the week", "tripled") are reported
// separately and are deliberately NOT set-differenced — see VAGUE below for why.

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALES = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };

// Ordinals are deliberately absent. "the first thing" is not a quantity, and mapping
// it to 1 reintroduces exactly the false positive this module exists to remove.
const WORD_VALUES = { ...UNITS, ...TENS, ...SCALES, dozen: 12 };

// "a" and "an" count only in front of a scale or dozen ("a hundred", "a dozen").
// "and" counts only between two number words ("a hundred and twenty").
const JOINERS = new Set(["and", "a", "an"]);

const SUFFIX_VALUES = { k: 1000, m: 1e6, bn: 1e9, hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };

// Phrases that carry a quantity claim without stating a number. The gate scores these
// strictly — gate-fixtures.md calls "hours every week" and "most of an evening"
// inventions — but they cannot be set-differenced against the brief, because the same
// word can be a time of day in the brief and a duration in the post. F2 is exactly
// that: the brief says "doing it again the next evening", the post says "costs you an
// evening", and only the second is a quantity. So these are always reported, never
// subtracted, and always judged by a human.
export const VAGUE = [
  // Fractions belong here rather than in the numeric set. "Half your applicants won't
  // answer" is a fabricated statistic and the F1 baseline printed exactly that, but
  // "third" and "quarter" are also ordinals and a calendar quarter, so mapping them to
  // numbers puts back the false positives the numeric pass exists to avoid.
  "half", "a third", "two thirds", "a quarter", "three quarters", "most", "the majority",
  "doubled", "tripled", "quadrupled", "halved", "double", "triple", "twice",
  "dozens", "scores of", "handful", "several", "countless", "umpteen",
  "most of", "much of", "chunk of", "chunks of", "plenty of", "loads of",
  "a full day", "all day", "all week", "an evening", "the evening", "evenings",
  "an afternoon", "afternoons", "a morning", "mornings", "fortnight",
  "hours", "days", "weeks", "months",
  "more than", "less than", "over", "under", "up to", "as much as", "as many as",
  "nearly", "almost", "roughly", "around", "about", "some", "many", "few",
];

// ---------------------------------------------------------------------------
// tokenising
// ---------------------------------------------------------------------------

// Hyphens join number words ("twenty-five"), so they become spaces. Everything else
// that is not a letter, digit, decimal point or thousands comma breaks a run, which
// stops "two, three drivers" reading as five.
function segments(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[-‐-―]/g, " ")
    // break on sentence and clause punctuation, but keep a comma inside 5,000 and a
    // decimal point inside 1.5
    .split(/[;:!?()"“”—\n]+|(?<![0-9]),(?![0-9])|\.(?!\d)/)
    .filter((s) => s.trim());
}

// A numeric literal plus an optional magnitude suffix. The trailing lookahead is what
// keeps "40 min" from reading as forty million: the suffix `m` only counts when no
// letter follows it.
const DIGIT_RE = /([£$€]?)(\d[\d,]*(?:\.\d+)?)\s*(%|percent|k|m|bn|hundred|thousand|million|billion)?(?![a-z0-9])/gi;

function digitValue(raw, suffix) {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const s = (suffix || "").toLowerCase();
  if (!s || s === "%" || s === "percent") return n;
  return n * (SUFFIX_VALUES[s] || 1);
}

// The standard accumulator: units and tens add, hundred multiplies what is pending,
// thousand and above bank it.
function runValue(words) {
  let total = 0;
  let current = 0;
  let seen = false;

  for (const w of words) {
    if (JOINERS.has(w)) continue;
    const v = WORD_VALUES[w];
    if (v === undefined) continue;
    seen = true;
    if (v >= 1000) {
      total += (current || 1) * v;
      current = 0;
    } else if (v === 100) {
      current = (current || 1) * v;
    } else {
      current += v;
    }
  }
  return seen ? total + current : null;
}

const isNumberWord = (w) => w !== undefined && Object.hasOwn(WORD_VALUES, w);

// ---------------------------------------------------------------------------
// extraction
// ---------------------------------------------------------------------------

/**
 * Every quantity in `text`, as a Map of numeric value to the surface forms that
 * produced it, each with the words around it.
 *
 * @returns {Map<number, Array<{ surface: string, context: string }>>}
 */
export function extractQuantities(text) {
  const found = new Map();
  const add = (value, surface, context) => {
    if (value === null || !Number.isFinite(value)) return;
    if (!found.has(value)) found.set(value, []);
    found.get(value).push({ surface, context });
  };

  for (const seg of segments(text)) {
    // digits first, and remember where they were so the word pass can skip them
    DIGIT_RE.lastIndex = 0;
    let m;
    while ((m = DIGIT_RE.exec(seg)) !== null) {
      const surface = m[0].trim();
      add(digitValue(m[2], m[3]), surface, contextAround(seg, m.index, surface.length));
    }

    const words = seg.split(/\s+/).map((w) => w.replace(/[^a-z]/g, "")).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      if (!isNumberWord(words[i]) && !startsArticleScale(words, i)) {
        i += 1;
        continue;
      }
      let j = i;
      const run = [];
      while (j < words.length) {
        const w = words[j];
        if (isNumberWord(w)) {
          run.push(w);
          j += 1;
        } else if (JOINERS.has(w) && isNumberWord(words[j + 1])) {
          run.push(w);
          j += 1;
        } else {
          break;
        }
      }
      const surface = run.join(" ");
      add(runValue(run), surface, contextAround(seg, seg.indexOf(surface), surface.length));
      i = Math.max(j, i + 1);
    }
  }
  return found;
}

// "a hundred" and "a dozen" are quantities; a bare "a" is not.
function startsArticleScale(words, i) {
  return (words[i] === "a" || words[i] === "an") && isNumberWord(words[i + 1]);
}

function contextAround(seg, at, len, window = 34) {
  if (at < 0) return seg.trim().slice(0, 80);
  const start = Math.max(0, at - window);
  const end = Math.min(seg.length, at + len + window);
  return (start > 0 ? "…" : "") + seg.slice(start, end).trim() + (end < seg.length ? "…" : "");
}

/**
 * Quantities present in `postText` and absent from `briefText`, normalised on both
 * sides so `forty` and `40` are the same number.
 *
 * These are candidates, not verdicts. A small cardinal used as an article
 * ("one of the reasons") lands here when the brief has no 1 anywhere; that is why
 * each entry carries its context.
 */
export function inventedQuantities(postText, briefText) {
  const brief = extractQuantities(briefText);
  const post = extractQuantities(postText);
  const out = [];
  for (const [value, uses] of post) {
    if (brief.has(value)) continue;
    out.push({ value, uses });
  }
  return out.sort((a, b) => a.value - b.value);
}

/** Vague quantity phrases in `text`, with context. Never subtracted — see VAGUE. */
export function vaguePhrases(text) {
  const hay = String(text ?? "").toLowerCase();
  const out = [];
  for (const phrase of VAGUE) {
    const re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "g");
    let m;
    while ((m = re.exec(hay)) !== null) {
      const at = m.index + m[1].length;
      out.push({ phrase, context: contextAround(hay, at, phrase.length) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// walking a planned post
// ---------------------------------------------------------------------------

/**
 * Every piece of copy in a post from `POST /plan`, as `{ field, text }`. Covers the
 * graphic and the LinkedIn copy, because an invented figure in the first comment
 * fails C2 exactly as hard as one in the headline — F2 failed in both.
 */
export function collectCopy(post = {}) {
  const spec = post.spec || post;
  const out = [];
  const push = (field, text) => {
    const s = String(text ?? "").trim();
    if (s) out.push({ field, text: s });
  };

  push("eyebrow", spec.eyebrow);
  push("headline", spec.headline);
  push("accentWord", spec.accentWord);

  for (const [i, b] of (spec.blocks || []).entries()) {
    const at = (name) => `blocks[${i}].${name}`;
    switch (b.type) {
      case "body":
      case "cta":
        push(at("text"), b.text);
        break;
      case "stat":
        push(at("value"), b.value);
        push(at("unit"), b.unit);
        push(at("label"), b.label);
        break;
      case "quote":
        push(at("text"), b.text);
        push(at("attribution"), b.attribution);
        break;
      case "points":
        (b.items || []).forEach((x, j) => push(at(`items[${j}]`), x));
        break;
      case "rows":
        (b.items || []).forEach((r, j) => {
          push(at(`items[${j}].name`), r?.name);
          push(at(`items[${j}].detail`), r?.detail);
          push(at(`items[${j}].label`), r?.label);
        });
        break;
      case "compare":
        (b.columns || []).forEach((c, j) => {
          push(at(`columns[${j}].title`), c?.title);
          push(at(`columns[${j}].label`), c?.label);
          push(at(`columns[${j}].text`), c?.text);
        });
        break;
      case "thread":
        push(at("title"), b.title);
        push(at("meta"), b.meta);
        (b.messages || []).forEach((msg, j) => push(at(`messages[${j}].text`), msg?.text));
        break;
      // screenshot carries a catalogue name, not copy
    }
  }

  push("caption", post.caption);
  push("firstComment", post.firstComment);
  push("altText", post.altText);
  push("note", post.note);
  return out;
}

/**
 * The C2 pass for one post: which quantities it introduced that the brief did not
 * supply, and which vague quantity phrases want a human eye.
 */
export function auditPost(post, briefText) {
  const copy = collectCopy(post);
  const joined = copy.map((c) => c.text).join(" . ");
  return {
    invented: inventedQuantities(joined, briefText),
    vague: vaguePhrases(joined),
    fields: copy,
  };
}

export default auditPost;
