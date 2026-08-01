// The post queue.
// A post is a finished piece of work waiting for Clay to look at: the rendered
// image, the caption that goes with it, the first comment, alt text, and a note
// on why this angle. Stored as JSON in R2, one object per post, so the queue
// survives restarts and is readable from the phone.

import { putJson, getJson, deleteKey, listKeys, uploadToR2 } from "./r2.js";
import { renderToPng } from "./render.js";
import { templates } from "../templates/index.js";

const PREFIX = "posts/";
const RENDER_PREFIX = "renders/";

export const STATUSES = ["draft", "approved", "posted", "rejected"];

function newId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Render the template and push the PNG to R2, returning its public URL.
async function renderAndStore(post) {
  const fn = templates[post.template];
  if (!fn) throw new Error(`unknown template '${post.template}'`);
  const r = fn({ format: post.format || "square", ...(post.data || {}) });
  const png = await renderToPng({ html: r.html, width: r.width, height: r.height, scale: 2 });
  const key = `${RENDER_PREFIX}${post.id}.png`;
  const url = await uploadToR2(png, key);
  return { url, width: r.width, height: r.height, bytes: png.length };
}

export async function createPost(input) {
  const {
    brand = "drivertrack",
    template,
    format = "square",
    data = {},
    caption = "",
    firstComment = "",
    altText = "",
    note = "",
    scheduledFor = "",
    skipRender = false,
  } = input;

  if (!template) throw new Error("template is required");
  if (!templates[template]) throw new Error(`unknown template '${template}'`);

  const post = {
    id: newId(),
    brand,
    template,
    format,
    data,
    caption,
    firstComment,
    altText,
    note,
    scheduledFor,
    status: "draft",
    imageUrl: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!skipRender) {
    const out = await renderAndStore(post);
    post.imageUrl = out.url;
  }

  await putJson(`${PREFIX}${post.id}.json`, post);
  return post;
}

export async function listPosts() {
  const keys = await listKeys(PREFIX);
  const posts = await Promise.all(
    keys.filter((k) => k.endsWith(".json")).map((k) => getJson(k).catch(() => null))
  );
  return posts
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getPost(id) {
  return getJson(`${PREFIX}${id}.json`);
}

export async function updatePost(id, patch = {}) {
  const post = await getPost(id);
  if (!post) return null;

  const dataChanged =
    patch.data && JSON.stringify(patch.data) !== JSON.stringify(post.data);

  Object.assign(post, patch, { id: post.id, updatedAt: new Date().toISOString() });

  // If the copy on the image changed, the image is stale. Re-render it.
  if (dataChanged) {
    const out = await renderAndStore(post);
    post.imageUrl = out.url + "?v=" + Date.now();
  }

  await putJson(`${PREFIX}${post.id}.json`, post);
  return post;
}

export async function deletePost(id) {
  const post = await getPost(id);
  if (!post) return false;
  await deleteKey(`${PREFIX}${id}.json`);
  try {
    await deleteKey(`${RENDER_PREFIX}${id}.png`);
  } catch (e) {
    // the render may already be gone; the post record is what matters
  }
  return true;
}
