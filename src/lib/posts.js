// The post queue.
// A post is a finished piece of work waiting for Clay to look at: the rendered
// image, the caption that goes with it, the first comment, alt text, and a note
// on why this angle. Stored as JSON in R2, one object per post, so the queue
// survives restarts and is readable from the phone.
//
// Note on image URLs: the render always lives at the deterministic key
// renders/{id}.png, so the public URL is DERIVED on read from the current
// R2_PUBLIC_BASE rather than stored on the record. That way changing the public
// base (custom domain, new bucket) fixes every post at once instead of leaving
// old records pointing at a dead host.

import { putJson, getJson, deleteKey, listKeys, uploadToR2 } from "./r2.js";
import { renderToPng } from "./render.js";
import { compose } from "../compose.js";

const PREFIX = "posts/";
const RENDER_PREFIX = "renders/";

export const STATUSES = ["draft", "approved", "posted", "rejected"];

function newId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function publicBase() {
  const b = process.env.R2_PUBLIC_BASE || process.env.ASSET_BASE || "";
  return b.replace(/\/$/, "");
}

// Derive the image URL. The ?v= cache-buster changes whenever the post is
// re-rendered, so a phone that already loaded the old image sees the new one.
function imageUrlFor(post) {
  const base = publicBase();
  // Older records stored imageUrl directly and have no hasRender flag.
  const rendered = post.hasRender || Boolean(post.imageUrl);
  if (!base || !rendered) return "";
  const v = Date.parse(post.renderedAt || post.updatedAt || "") || 0;
  return `${base}/${RENDER_PREFIX}${post.id}.png?v=${v}`;
}

// What goes out over the wire: the stored record plus the derived URL.
function present(post) {
  if (!post) return post;
  return { ...post, imageUrl: imageUrlFor(post) };
}

// Compose the post and push the PNG to R2 at the post's deterministic key.
async function renderAndStore(post) {
  // Every post carries a composed spec. Records from before the composer carried
  // a template name instead; those templates are gone, so say so plainly rather
  // than failing somewhere further down.
  if (!post.spec) {
    throw new Error(
      post.template
        ? `post ${post.id} predates the composer (template '${post.template}'); rewrite it with a spec`
        : `post ${post.id} has no spec`
    );
  }
  const r = compose(post.spec);
  const png = await renderToPng({ html: r.html, width: r.width, height: r.height, scale: 2 });
  await uploadToR2(png, `${RENDER_PREFIX}${post.id}.png`);
  post.hasRender = true;
  post.renderedAt = new Date().toISOString();
  return { width: r.width, height: r.height, bytes: png.length };
}

export async function createPost(input) {
  const {
    brand = "drivertrack",
    spec = null,
    format = "square",
    caption = "",
    firstComment = "",
    altText = "",
    note = "",
    scheduledFor = "",
    status = "draft",
    skipRender = false,
  } = input;

  if (!spec) throw new Error("a spec is required");

  const now = new Date().toISOString();
  const post = {
    id: newId(),
    brand, spec, format,
    caption, firstComment, altText, note, scheduledFor,
    status: STATUSES.includes(status) ? status : "draft",
    hasRender: false,
    renderedAt: "",
    createdAt: now,
    updatedAt: now,
  };

  if (!skipRender) await renderAndStore(post);

  await putJson(`${PREFIX}${post.id}.json`, post);
  return present(post);
}

export async function listPosts() {
  const keys = await listKeys(PREFIX);
  const posts = await Promise.all(
    keys.filter((k) => k.endsWith(".json")).map((k) => getJson(k).catch(() => null))
  );
  return posts
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .map(present);
}

export async function getPost(id) {
  return present(await getJson(`${PREFIX}${id}.json`));
}

async function getRaw(id) {
  return getJson(`${PREFIX}${id}.json`);
}

export async function updatePost(id, patch = {}) {
  const post = await getRaw(id);
  if (!post) return null;

  const { force, imageUrl, hasRender, renderedAt, ...safe } = patch; // never patched directly

  const specChanged =
    safe.spec && JSON.stringify(safe.spec) !== JSON.stringify(post.spec);
  const formatChanged = safe.format && safe.format !== post.format;

  Object.assign(post, safe, { id: post.id, updatedAt: new Date().toISOString() });

  // Anything that changes what the image looks like means the image is stale.
  if (force || specChanged || formatChanged || !post.hasRender) {
    await renderAndStore(post);
  }

  await putJson(`${PREFIX}${post.id}.json`, post);
  return present(post);
}

// Re-render every post. Useful after a block or brand token change.
export async function rerenderAll() {
  const keys = await listKeys(PREFIX);
  const ids = keys.filter((k) => k.endsWith(".json"))
    .map((k) => k.slice(PREFIX.length, -".json".length));
  const done = [];
  for (const id of ids) {
    try {
      const post = await getRaw(id);
      if (!post) continue;
      await renderAndStore(post);
      post.updatedAt = new Date().toISOString();
      await putJson(`${PREFIX}${id}.json`, post);
      done.push(id);
    } catch (e) {
      done.push(`${id} FAILED: ${e.message}`);
    }
  }
  return done;
}

export async function deletePost(id) {
  const post = await getRaw(id);
  if (!post) return false;
  await deleteKey(`${PREFIX}${id}.json`);
  try {
    await deleteKey(`${RENDER_PREFIX}${id}.png`);
  } catch (e) {
    // the render may already be gone; the post record is what matters
  }
  return true;
}
