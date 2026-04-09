const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

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
  };
}

module.exports = {
  createS3Storage,
  sanitizeS3PathSegment,
};
