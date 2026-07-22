// Cloudflare R2 upload helper.
// R2 is S3-compatible, so we use the AWS S3 client pointed at the R2 endpoint.
// Set these env vars in Railway:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE
// R2_PUBLIC_BASE is the public URL base for the bucket (custom domain or r2.dev),
// e.g. https://assets.drivertrack.co  or  https://pub-xxxx.r2.dev

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let client = null;
function getClient() {
  if (client) return client;
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 env vars not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export async function uploadToR2(buffer, key, contentType = "image/png") {
  const bucket = process.env.R2_BUCKET;
  const base = process.env.R2_PUBLIC_BASE;
  if (!bucket) throw new Error("R2_BUCKET not set");
  if (!base) throw new Error("R2_PUBLIC_BASE not set");

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${base.replace(/\/$/, "")}/${key}`;
}

export default uploadToR2;
