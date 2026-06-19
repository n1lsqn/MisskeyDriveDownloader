import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client!: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      endpoint: this.configService.r2Endpoint,
      credentials: {
        accessKeyId: this.configService.r2AccessKeyId,
        secretAccessKey: this.configService.r2SecretAccessKey,
      },
      region: 'auto', // R2 expects 'auto' region
      forcePathStyle: this.configService.r2ForcePathStyle,
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    const bucketName = this.configService.r2BucketName;
    try {
      this.logger.log(`Checking if bucket "${bucketName}" exists...`);
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Bucket "${bucketName}" exists.`);
    } catch {
      // Bucket does not exist, or we lack permissions. Try creating it.
      this.logger.warn(
        `Bucket "${bucketName}" not found. Attempting to create it...`,
      );
      try {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: bucketName }),
        );
        this.logger.log(`Bucket "${bucketName}" created successfully.`);
      } catch (createErr: unknown) {
        this.logger.error(
          `Failed to create bucket "${bucketName}". Make sure your credentials are correct.`,
          createErr instanceof Error ? createErr.stack : String(createErr),
        );
      }
    }
  }

  async uploadFileStream(key: string, filePath: string): Promise<void> {
    const bucketName = this.configService.r2BucketName;
    const fileStream = fs.createReadStream(filePath);
    const stats = fs.statSync(filePath);

    this.logger.log(
      `Uploading file ${filePath} (${stats.size} bytes) to R2 at key "${key}"...`,
    );

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentLength: stats.size,
      ContentType: 'application/zip',
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Successfully uploaded ZIP to R2: "${key}"`);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to upload file to R2: "${key}"`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const bucketName = this.configService.r2BucketName;
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
      return url;
    } catch (err: unknown) {
      this.logger.error(
        `Failed to generate presigned URL for key "${key}"`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async deleteFile(key: string): Promise<void> {
    const bucketName = this.configService.r2BucketName;
    this.logger.log(`Deleting file "${key}" from bucket "${bucketName}"...`);
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file from R2: "${key}"`);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to delete file from R2: "${key}"`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
