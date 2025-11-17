import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { config } from "../config/env";
import { logger, LogCategory } from "../utils/logger";

export class S3Service {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    this.client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    this.bucketName = config.aws.bucketName;
  }

  async uploadFile(
    key: string,
    content: Buffer,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: contentType,
      Metadata: metadata,
    });

    await this.client.send(command);
    return `s3://${this.bucketName}/${key}`;
  }

  async downloadFile(key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        for await (const chunk of response.Body as any) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      }

      return null;
    } catch (error: any) {
      if (
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async uploadString(key: string, content: string): Promise<void> {
    await this.uploadFile(
      key,
      Buffer.from(content, "utf-8"),
      "application/json"
    );
  }

  generateKey(syncId: string, recordId: string, fileName: string): string {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${syncId}/${recordId}/${sanitizedFileName}`;
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
    } catch (error: any) {
      if (
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return;
      }
      throw error;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });
      const response = await this.client.send(command);
      return (response.Contents || [])
        .map((obj) => obj.Key || "")
        .filter(Boolean);
    } catch (error) {
      logger.warn(LogCategory.STORAGE, "Failed to list files", {
        prefix,
        error,
      });
      return [];
    }
  }
}
