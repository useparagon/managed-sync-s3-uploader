import dotenv from "dotenv";

dotenv.config();

export const config = {
  paragon: {
    baseUrl: process.env.PARAGON_BASE_URL || "https://sync.useparagon.com/api",
    signingKey: process.env.PARAGON_SIGNING_KEY || "",
    projectId: process.env.PARAGON_PROJECT_ID || "",
    tokenExpirationSeconds: parseInt(
      process.env.PARAGON_TOKEN_EXPIRATION_SECONDS || "3600",
      10
    ),
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    bucketName: process.env.AWS_S3_BUCKET_NAME || "",
    region: process.env.AWS_REGION || "us-east-1",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    webhookSecret: process.env.WEBHOOK_SECRET,
  },
  webhook: {
    customerWebhookUrl: process.env.CUSTOMER_WEBHOOK_URL,
  },
  persistence: {
    mode: (process.env.PERSISTENCE_MODE || "s3") as "s3" | "file",
    filePath:
      process.env.PERSISTENCE_FILE_PATH || "/app/data/.processed-records.json",
    s3Key:
      process.env.PERSISTENCE_S3_KEY || ".sync-state/processed-records.json",
  },
};

if (
  !config.aws.accessKeyId ||
  !config.aws.secretAccessKey ||
  !config.aws.bucketName
) {
  throw new Error("AWS credentials and bucket name are required");
}
