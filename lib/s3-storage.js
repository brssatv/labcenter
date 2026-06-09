const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

function sanitizeS3PathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/.]+|[-/.]+$/g, "")
    .slice(0, 160) || "file";
}

function createS3Storage(options = {}) {
  const bucket = String(options.bucket || "").trim();
  const region = String(options.region || "").trim();
  if (!bucket || !region) {
    return {
      enabled: false,
      uploadBuffer: async () => null,
      downloadBuffer: async () => null,
    };
  }

  const endpoint = String(options.endpoint || "").trim();
  const keyPrefix = sanitizeS3PathSegment(options.keyPrefix || "");
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(options.forcePathStyle),
  });

  return {
    enabled: true,
    bucket,
    region,
    async uploadBuffer({ key, body, contentType, metadata = {}, contentDisposition, cacheControl }) {
      const normalizedKey = sanitizeS3PathSegment(key);
      const objectKey = keyPrefix ? `${keyPrefix}/${normalizedKey}` : normalizedKey;
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType || undefined,
        Metadata: Object.fromEntries(
          Object.entries(metadata)
            .map(([name, value]) => [String(name || "").trim().toLowerCase(), String(value || "").trim()])
            .filter(([name, value]) => name && value)
        ),
        ContentDisposition: contentDisposition || undefined,
        CacheControl: cacheControl || undefined,
      }));
      return {
        bucket,
        region,
        key: objectKey,
        sizeBytes: Buffer.isBuffer(body) ? body.length : Number(body?.length || 0),
      };
    },
    async downloadBuffer({ bucket: sourceBucket, key }) {
      const normalizedKey = sanitizeS3PathSegment(key);
      const object = await client.send(new GetObjectCommand({
        Bucket: String(sourceBucket || bucket).trim() || bucket,
        Key: normalizedKey,
      }));
      const body = object?.Body;
      if (!body) {
        return {
          body: Buffer.alloc(0),
          contentType: String(object?.ContentType || "").trim(),
          contentLength: Number(object?.ContentLength || 0),
          contentDisposition: String(object?.ContentDisposition || "").trim(),
        };
      }
      let bytes;
      if (typeof body.transformToByteArray === "function") {
        bytes = Buffer.from(await body.transformToByteArray());
      } else if (Buffer.isBuffer(body)) {
        bytes = body;
      } else if (body instanceof Uint8Array) {
        bytes = Buffer.from(body);
      } else if (typeof body === "string") {
        bytes = Buffer.from(body);
      } else {
        const chunks = [];
        for await (const chunk of body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        bytes = Buffer.concat(chunks);
      }
      return {
        body: bytes,
        contentType: String(object?.ContentType || "").trim(),
        contentLength: Number(object?.ContentLength || bytes.length || 0),
        contentDisposition: String(object?.ContentDisposition || "").trim(),
      };
    },
  };
}

module.exports = {
  createS3Storage,
  sanitizeS3PathSegment,
};
