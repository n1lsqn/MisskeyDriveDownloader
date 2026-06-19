import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';
import { MisskeyService } from '../misskey/misskey.service';
import { StorageService } from '../storage/storage.service';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import axios from 'axios';
import { Readable } from 'stream';

interface ExportJobData {
  jobId: string;
  instanceUrl: string;
  token: string;
  username: string;
}

@Injectable()
export class ExportProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly misskeyService: MisskeyService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<ExportJobData>(
      'export-queue',
      async (job: Job<ExportJobData>) => {
        await this.processExport(job);
      },
      {
        connection: {
          host: this.configService.redisHost,
          port: this.configService.redisPort,
        },
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed:`, err);
    });

    this.logger.log('Export Queue Processor Worker initialized.');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processExport(job: Job<ExportJobData>): Promise<void> {
    const { jobId, instanceUrl, token, username } = job.data;
    this.logger.log(
      `Starting export job ${jobId} for @${username}@${instanceUrl}`,
    );

    const tempDir = path.resolve(process.cwd(), 'data', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `${jobId}.zip`);

    try {
      // 1. Update status to processing
      await this.databaseService.updateJobStatus(jobId, 'processing');

      // 2. Build folder map
      const folderPathMap = await this.misskeyService.buildFolderPathMap(
        instanceUrl,
        token,
      );

      // 3. Get all files
      const files = await this.misskeyService.getFiles(instanceUrl, token);
      const totalFiles = files.length;
      await this.databaseService.updateJobProgress(
        jobId,
        0,
        totalFiles,
        'Initializing zip...',
      );

      // 4. Initialize Archiver
      const output = fs.createWriteStream(tempFilePath);
      const archive = new archiver.ZipArchive({
        zlib: { level: 9 }, // Maximum compression
      });

      archive.on('error', (err: Error) => {
        throw err;
      });

      archive.pipe(output);

      // 5. Download and append files to ZIP sequentially
      const addedPaths = new Set<string>();
      let progress = 0;

      for (const file of files) {
        progress++;
        const sanitizedName = this.misskeyService.getSanitizedFileName(
          file.name,
        );
        const folderPath = file.folderId
          ? folderPathMap.get(file.folderId)
          : null;

        // Resolve path collision in zip
        let zipPath = folderPath
          ? `${folderPath}/${sanitizedName}`
          : sanitizedName;
        let counter = 1;
        const fileExt = path.extname(sanitizedName);
        const fileBase = path.basename(sanitizedName, fileExt);

        while (addedPaths.has(zipPath)) {
          const suffix = ` (${counter})`;
          const newName = `${fileBase}${suffix}${fileExt}`;
          zipPath = folderPath ? `${folderPath}/${newName}` : newName;
          counter++;
        }
        addedPaths.add(zipPath);

        // Update DB progress
        await this.databaseService.updateJobProgress(
          jobId,
          progress,
          totalFiles,
          sanitizedName,
        );

        if (!file.url) {
          const errorMsg = `Skip file: ${file.name} (ID: ${file.id}) - No URL provided by Misskey instance.`;
          archive.append(errorMsg, { name: `${zipPath}.failed.txt` });
          this.logger.warn(errorMsg);
          continue;
        }

        try {
          // Download file stream
          const response = await axios({
            method: 'get',
            url: file.url,
            responseType: 'stream',
            timeout: 60000,
          });
          const fileStream = response.data as Readable;

          // Append file stream to archiver and wait until it's read
          await new Promise<void>((resolve, reject) => {
            fileStream.on('error', (err: unknown) => {
              reject(err instanceof Error ? err : new Error(String(err)));
            });
            archive.append(fileStream, { name: zipPath });
            archive.once('entry', () => resolve());
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to archive file "${file.name}" from ${file.url}: ${errMsg}`,
          );
          const failContent = `Download failed for file: ${file.name}\nURL: ${file.url}\nError: ${errMsg}`;
          archive.append(failContent, { name: `${zipPath}.failed.txt` });
        }
      }

      // 6. Finalize zip archive
      this.logger.log(`Finalizing ZIP archive for job ${jobId}...`);
      await this.databaseService.updateJobProgress(
        jobId,
        totalFiles,
        totalFiles,
        'Finalizing zip file...',
      );

      const finalizePromise = new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', (err) => reject(err));
      });

      await archive.finalize();
      await finalizePromise;

      // 7. Upload to R2
      await this.databaseService.updateJobStatus(jobId, 'uploading');
      const r2Key = `exports/${jobId}.zip`;
      await this.storageService.uploadFileStream(r2Key, tempFilePath);

      // 8. Mark job as done
      await this.databaseService.updateJobStatus(jobId, 'done', {
        zipKey: r2Key,
      });
      this.logger.log(`Job ${jobId} completed successfully.`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error in export processor for job ${jobId}: ${errMsg}`,
      );
      await this.databaseService.updateJobStatus(jobId, 'failed', {
        error: errMsg,
      });
    } finally {
      // 9. Clean up local temporary file
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (unlinkErr) {
          this.logger.error(
            `Failed to delete temp file ${tempFilePath}:`,
            unlinkErr,
          );
        }
      }
    }
  }
}
