import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ConfigService } from '../config/config.service';
import { DatabaseService, JobRecord } from '../database/database.service';
import { MisskeyService } from '../misskey/misskey.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ExportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportService.name);
  private queue!: Queue;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly misskeyService: MisskeyService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit() {
    this.queue = new Queue('export-queue', {
      connection: {
        host: this.configService.redisHost,
        port: this.configService.redisPort,
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
    this.logger.log('Export Queue initialized.');
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
  }

  async triggerExport(): Promise<JobRecord> {
    // 1. Test connection to Misskey
    const isConnected = await this.misskeyService.testConnection();
    if (!isConnected) {
      throw new Error(
        'Failed to connect to Misskey. Check your instance URL and API token.',
      );
    }

    // 2. Check for active (queued or processing) jobs for this user token
    // (Since we have a single configured token in .env, we check active jobs globally)
    const allJobs = await this.databaseService.getAllJobs();
    const activeJobs = allJobs.filter(
      (job) =>
        job.status === 'queued' ||
        job.status === 'processing' ||
        job.status === 'uploading',
    );
    if (activeJobs.length >= 2) {
      throw new Error(
        'Too many active jobs. A maximum of 2 concurrent exports is allowed.',
      );
    }

    // 3. Create job ID and DB entry (expires in 3 days initially)
    const jobId = randomUUID();
    const expiresAt = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000,
    ).toISOString(); // +3 days
    const jobRecord = await this.databaseService.createJob(
      jobId,
      'queued',
      expiresAt,
    );

    // 4. Add job to BullMQ queue
    await this.queue.add('generate-zip', { jobId }, { jobId, attempts: 1 });

    this.logger.log(`Export job ${jobId} queued.`);
    return jobRecord;
  }

  async getJob(id: string): Promise<JobRecord & { downloadUrl?: string }> {
    const job = await this.databaseService.getJob(id);
    if (!job) {
      throw new NotFoundException(`Export job with ID ${id} not found.`);
    }

    // Generate Pre-signed URL if job is finished successfully and not expired
    let downloadUrl: string | undefined;
    if (job.status === 'done' && job.zipKey) {
      // Checked URL lifetime - 1 hour (3600 seconds)
      downloadUrl = await this.storageService.getPresignedUrl(job.zipKey, 3600);

      // Handle download lifecycle & expiration extension rules
      const now = new Date();
      let updatedExpiresAt = new Date(job.expiresAt);

      if (!job.downloadedAt) {
        // First download: Record downloadedAt and extend expiresAt by 7 days
        const firstDownloadAt = now.toISOString();
        const extendedExpires = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        ); // +7 days

        // Cap absolute lifetime at 30 days from creation
        const creationTime = new Date(job.createdAt);
        const maxExpiresLimit = new Date(
          creationTime.getTime() + 30 * 24 * 60 * 60 * 1000,
        ); // +30 days max

        if (extendedExpires > maxExpiresLimit) {
          updatedExpiresAt = maxExpiresLimit;
        } else {
          updatedExpiresAt = extendedExpires;
        }

        await this.databaseService.updateJobStatus(id, 'done', {
          downloadedAt: firstDownloadAt,
          expiresAt: updatedExpiresAt.toISOString(),
        });

        job.downloadedAt = firstDownloadAt;
        job.expiresAt = updatedExpiresAt.toISOString();
      } else {
        // Subsequent downloads: Extend expiresAt by 7 days from now, up to a max of 30 days from creation
        const extendedExpires = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        );
        const creationTime = new Date(job.createdAt);
        const maxExpiresLimit = new Date(
          creationTime.getTime() + 30 * 24 * 60 * 60 * 1000,
        );

        if (extendedExpires > maxExpiresLimit) {
          updatedExpiresAt = maxExpiresLimit;
        } else if (extendedExpires > updatedExpiresAt) {
          // Only update if extension is further in the future than the current expiresAt
          updatedExpiresAt = extendedExpires;
        }

        await this.databaseService.updateJobStatus(id, 'done', {
          expiresAt: updatedExpiresAt.toISOString(),
        });
        job.expiresAt = updatedExpiresAt.toISOString();
      }
    }

    return {
      ...job,
      downloadUrl,
    };
  }

  async getAllJobs(): Promise<JobRecord[]> {
    return this.databaseService.getAllJobs();
  }
}
