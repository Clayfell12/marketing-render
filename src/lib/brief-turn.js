// Conversational briefing: one user message, one server-side turn.
//
// The chat model is a producer, not a copywriter. It interviews, keeps the working
// brief, and (from Phase 3) calls the planner when it has enough. It never writes a
// spec itself, so it cannot contradict rules it was never told. See
// conversation-plan-v4.md §7.
//
// Phase 2 ships `update_brief` and `reply` only. Drafting, revision and readiness
// arrive with the planner tool.

import { drivertrack } from "../tokens/drivertrack.js";
import { blockNamesForPrompt } from "./planner.js";
import { BriefError, mergeBrief, missingSlots } from "./brief.js";
import { log } from "./brief-log.js";

const MODEL = process.env.BRIEF_MODEL || "claude-opus-5";
const MAX_ROUNDS = 6;
const MAX_OPTIONS = 4;

const BRANDS = { drivertrack };

// ---------------------------------------------------------------------------
// The system block. Cached, so it must be byte-identical across every turn of every
// session for a brand: no timestamps, no session id, no per-turn interpolation.
// It also has to clear the cache minimum, which is 1024 tokens on Sonnet and 512 on
// Opus — under that, cache_control is silently ignored and nothing tells you.
// ---------------------------------------------------------------------------

const systemCache = new Map();

export function systemFor(brand) {
  if (systemCache.has(brand)) return systemCache.get(brand);

  const b = BRANDS[brand];
  if (!b) throw new BriefError(`no prompt for brand '${brand}'`);
  const v = b.voice;

  const text = `You are the producer for ${b.name}'s social graphics. You are not the
writer. Your job is to work out what a post should be, with the person you are talking
to, and then hand a settled brief to the planner that writes it. You never write
headlines or captions yourself.

WHO THE POSTS ARE FOR
${v.audience}

THE REGISTER THEY EXPECT
${v.register}

WHAT GOOD LOOKS LIKE
${v.doThis.map((x) => `- ${x}`).join("\n")}

WHAT TO STAY AWAY FROM
${v.avoid.map((x) => `- ${x}`).join("\n")}

HOW A GRAPHIC IS BUILT
Every graphic is the same locked shell: brand ground, logo, an eyebrow with a blue
diamond, and a headline. Underneath sit one or two blocks, three only if one is a call
to action. You do not choose a layout, because there isn't one to choose. The blocks
available are:
${blockNamesForPrompt().map((x) => `- ${x}`).join("\n")}

THE THREE THINGS THAT DECIDE EVERYTHING

1. The idea. One per graphic. A feed post gets one to two seconds of attention, so two
   ideas means two posts. This is an attention limit, not a style preference.

2. What proof exists. You may never invent a statistic, a result, a customer name or a
   quote, and you may not soften an invented one into a vaguer claim either: "hours
   every week" is as invented as "eight hours a week". If there is a real figure, the
   stat block is available and the planner should lead with it. If there is a real
   quote and permission to use it, the quote block is available and the attribution
   stays anonymous. If there is neither, the post argues from reasoning and says so
   plainly. Asking whether a figure is confirmed is one of the most useful things you
   can do, because a half-remembered number is worse than none.

3. Whether the post shows the product. This decides the theme, which is a rule rather
   than a preference: dark for anything showing the product (threads, screenshots,
   screening decisions, pipelines), light for a statement post with no product in it.
   Mixing them at random undoes the recognition that consistent assets build.
   Never ask which theme someone wants. Ask whether this post shows the product, and
   the theme follows.

HOW TO RUN THE CONVERSATION

Ask at most two questions in a turn. A phone keyboard is the slowest part of this
system, so when a question has a small set of likely answers, offer them as options and
let them be tapped instead of typed.

Only three things are ever worth a question: the idea, what proof exists, and whether
the post shows the product. Those are the ones where guessing wrong wastes a render.
Everything else gets a stated assumption instead: say what you are going to do and move
on, so it can be corrected if it is wrong. "I'll do two, direct response, unless you say
otherwise" is better than asking, because it can be ignored and the work still proceeds.

Never ask how many posts. Two is the default and it is rarely worth a turn.

Once the idea, the proof and the product question are settled, stop asking and say so.
Do not keep gathering detail because more detail feels safer. The person you are talking
to can end the conversation at any point and take what is on the table, so a question
that is not worth their time is not worth asking.

Record what you learn with update_brief as you go, in the same turn you learn it. It is
silent and it is what everything downstream reads, so a fact that is only in the chat
and not in the brief may as well not exist.

Every turn ends by calling reply. That is how anything you say reaches the screen.`;

  systemCache.set(brand, text);
  return text;
}

// ---------------------------------------------------------------------------
// Tools
//
// strict: true with additionalProperties: false on every object. `required` lists only
// what is genuinely required — optional keys are simply absent from it, which was
// probed against the live API rather than assumed. `additionalProperties: false` is not
// optional; omitting it is a 400.
// ---------------------------------------------------------------------------

const obj = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: false,
});

export const TOOLS = [
  {
    name: "update_brief",
    description:
      "Record what you have learned about the post. Silent: it does not speak to the " +
      "user. Send only the slots you are changing; anything you leave out is left " +
      "alone. Call it in the same turn you learn something, not later.",
    strict: true,
    input_schema: obj({
      idea: { type: "string", description: "The single claim this post makes." },
      proof: obj({
        kind: { type: "string", enum: ["figure", "quote", "none"] },
        detail: { type: "string", description: "The figure or quote itself, exactly as given. Empty when kind is none." },
      }, ["kind", "detail"]),
      showsProduct: { type: "boolean", description: "True if the post shows the product. Decides the theme." },
      demonstration: { type: "string", description: "thread, screenshot:<name>, or none." },
      intent: { type: "string", enum: ["direct", "opinion"] },
      count: { type: "integer", description: "How many posts, 1 to 7. Default 2." },
      avoid: { type: "array", items: { type: "string" }, description: "Angles to stay off. Replaces what is there." },
      schedule: { type: "string" },
      notes: { type: "array", items: { type: "string" }, description: "Anything else the planner should know. Appends." },
    }),
  },
  {
    name: "reply",
    description:
      "Say something to the user. Every turn ends with this. When you are asking " +
      "something with a small set of likely answers, put them in options so they can " +
      "be tapped rather than typed.",
    strict: true,
    input_schema: obj({
      text: { type: "string" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Up to four short tappable answers. Omit when not asking.",
      },
    }, ["text"]),
  },
];

// update_brief must run before anything that reads the brief, and the end tool must run
// last or it terminates the turn before the mutators beside it have taken effect.
const TIER = { update_brief: 0, reply: 2 };
const tierOf = (name) => (name in TIER ? TIER[name] : 1);

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

function toMessages(session) {
  const messages = session.transcript.map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.text,
  }));

  // Volatile state goes last, after the append-only transcript, so the cacheable
  // prefix stays intact as the conversation grows.
  const missing = missingSlots(session.brief);
  messages.push({
    role: "user",
    content:
      `CURRENT BRIEF\n${JSON.stringify(session.brief, null, 2)}\n\n` +
      (missing.length
        ? `STILL UNSETTLED: ${missing.join(", ")}`
        : `Everything required is settled. Say so rather than asking more.`),
  });

  return messages;
}

async function callModel({ brand, messages, fetchImpl }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new BriefError("ANTHROPIC_API_KEY is not set.", 500);

  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [
        { type: "text", text: systemFor(brand), cache_control: { type: "ephemeral" } },
      ],
      tools: TOOLS,
      // Forced choice makes "the model replied in prose and skipped the end tool" a
      // state the API cannot produce. reply is always a legitimate answer, so this
      // does not distort which tool gets picked.
      tool_choice: { type: "any" },
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BriefError(`the model call failed (${res.status}). ${body.slice(0, 300)}`, 502);
  }
  return res.json();
}

function runTool(session, name, input) {
  if (name === "update_brief") {
    session.brief = mergeBrief(session.brief, input || {});
    return { ok: true, brief: session.brief, stillUnsettled: missingSlots(session.brief) };
  }

  if (name === "reply") {
    const options = (input.options || []).map(String).slice(0, MAX_OPTIONS);
    session.transcript.push({
      role: "assistant",
      text: String(input.text || ""),
      options,
      at: new Date().toISOString(),
    });
    return { ok: true, ended: true };
  }

  throw new BriefError(`unknown tool '${name}'`);
}

function say(session, text, options = []) {
  session.transcript.push({ role: "assistant", text, options, at: new Date().toISOString() });
}

/**
 * Run one turn against a session that already has the user's message appended.
 * Mutates the session. Intended to be the `work` of a withLock call.
 */
export async function runTurn(session, { fetchImpl = fetch } = {}) {
  const started = Date.now();
  const messages = toMessages(session);
  const stats = { rounds: 0, tools: [], cacheRead: 0, output: 0 };
  let ended = false;

  while (stats.rounds < MAX_ROUNDS && !ended) {
    stats.rounds += 1;
    const res = await callModel({ brand: session.brand, messages, fetchImpl });

    stats.cacheRead += res.usage?.cache_read_input_tokens || 0;
    stats.output += res.usage?.output_tokens || 0;

    const uses = (res.content || []).filter((b) => b.type === "tool_use");

    if (res.stop_reason !== "tool_use" || !uses.length) {
      // tool_choice: any should make this unreachable. If it fires, an assumption
      // broke — take the text so the user is not left with nothing, and say so.
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      say(session, text || "Sorry, I lost my thread there. Say that again?");
      log("brief.error", { id: session.id, where: "no-end-tool", stop: res.stop_reason });
      ended = true;
      break;
    }

    const ordered = [...uses].sort((a, b) => tierOf(a.name) - tierOf(b.name));
    const results = [];

    for (const u of ordered) {
      const t0 = Date.now();
      let result;
      try {
        result = runTool(session, u.name, u.input || {});
        if (result.ended) ended = true;
        log("brief.tool", { id: session.id, tool: u.name, ok: true, ms: Date.now() - t0 });
      } catch (e) {
        // Hand the failure back rather than dropping it: a missing tool_result is a
        // malformed request, and the model can usually fix a bad patch itself.
        result = { ok: false, error: e.message };
        log("brief.tool", { id: session.id, tool: u.name, ok: false, ms: Date.now() - t0, error: e.message });
      }
      stats.tools.push(u.name);
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result), is_error: !result.ok });
    }

    if (ended) break;

    // Every result from one assistant message goes back in one user message. Splitting
    // them is a malformed request and trains the model out of parallel calls.
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: results });
  }

  if (!ended) {
    say(session, "I've gone round a few times without landing anywhere. Where would you like to take it?");
    log("brief.error", { id: session.id, where: "round-cap", rounds: stats.rounds });
  }

  stats.ms = Date.now() - started;
  return stats;
}

export default runTurn;
