// Approval: the point where drafts stop being text and become rendered posts.
//
// Partial by design. Each draft has its own state, so "talk until we agree" can settle
// two of three posts and keep talking about the third. Without that it collapses back to
// all-or-nothing, which is where this feature started. See conversation-plan-v4.md §9.
//
// It takes the same turn lock as `message`, because approving while a revision is in
// flight would render drafts that are about to be replaced.

import { withLock, openDrafts, BriefError } from "./brief.js";
import { createPost } from "./posts.js";
import { log } from "./brief-log.js";

// One render is a Chromium launch and an R2 upload. Three is about what fits inside a
// proxy timeout; the client approves the rest in a second call.
export const APPROVE_CAP = 3;

// Injectable for the same reason brief.js injects its store: rendering means Chromium
// and R2, and the approval rules are worth testing without either.
let create = createPost;
export function __setRenderer(fn) {
  create = fn || createPost;
}

/**
 * @param {string} id
 * @param {{ rev?: number, only?: string[], force?: boolean }} opts
 * @returns {Promise<{ ok, posts, drafts, error? }>}
 */
export async function approveDrafts(id, { rev, only, force = false } = {}) {
  const { session, result } = await withLock(id, {
    rev,
    allowStatuses: ["open", "drafted", "ready"],
    work: (s) => approveWithin(s, { only, force }),
  });
  return { ...result, session };
}

// Split out so the lock and the work are separately readable, and so tests can drive the
// work directly without a store.
export async function approveWithin(session, { only, force = false } = {}) {
  const wanted = Array.isArray(only) && only.length
    ? only.map(String)
    : openDrafts(session).map((d) => d.draftId);

  const unknown = wanted.filter((wid) => !session.drafts.some((d) => d.draftId === wid));
  if (unknown.length) throw new BriefError(`no draft '${unknown[0]}'`, 400);

  // Already-rendered drafts are skipped rather than rejected, so a retry after a
  // mid-batch failure is safe to send with the same target list. No double render.
  const targets = wanted
    .map((wid) => session.drafts.find((d) => d.draftId === wid))
    .filter((d) => !d.postId);

  if (!targets.length) {
    return { ok: true, posts: [], drafts: session.drafts, skipped: wanted };
  }
  if (!targets.some((d) => d.spec?.headline)) {
    throw new BriefError("none of those drafts has a headline to render", 400);
  }
  if (session.status !== "ready" && !force) {
    throw new BriefError(
      `session is ${session.status}, not ready. Send force: true to approve anyway.`,
      400
    );
  }
  if (targets.length > APPROVE_CAP) {
    throw new BriefError(
      `${targets.length} drafts is over the ${APPROVE_CAP} per call cap. ` +
        `Approve up to ${APPROVE_CAP} with 'only', then send the rest.`,
      400
    );
  }

  const started = Date.now();
  const posts = [];
  for (const draft of targets) {
    try {
      const post = await create({
        brand: session.brand,
        spec: draft.spec,
        caption: draft.caption,
        firstComment: draft.firstComment,
        altText: draft.altText,
        note: draft.note,
        scheduledFor: draft.scheduledFor,
        status: "approved",
      });
      draft.state = "approved";
      draft.postId = post.id;
      session.postIds.push(post.id);
      posts.push(post);
    } catch (e) {
      // Successes stay: the lock release writes the session either way, so the drafts
      // already rendered keep their postId and a retry continues from where this stopped.
      // Status is deliberately not advanced — the batch did not finish.
      log("brief.approve", {
        id: session.id, count: posts.length, ok: false, ms: Date.now() - started,
        postIds: posts.map((p) => p.id), failed: draft.draftId,
      });
      log("brief.error", { id: session.id, where: "approve", message: e.message });
      return { ok: false, error: `${draft.draftId} failed to render: ${e.message}`, posts, drafts: session.drafts };
    }
  }

  log("brief.approve", {
    id: session.id, count: posts.length, ok: true, ms: Date.now() - started,
    postIds: posts.map((p) => p.id),
  });

  // Only when nothing is left open does the session finish. Otherwise leave the status
  // alone so the conversation can continue about the rest.
  if (!openDrafts(session).length) {
    session.status = "rendered";
    session.approvedAt = new Date().toISOString();
  }

  return { ok: true, posts, drafts: session.drafts };
}

export default approveDrafts;
