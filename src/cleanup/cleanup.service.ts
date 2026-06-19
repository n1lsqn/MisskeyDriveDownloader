import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit() {
    // Run cleanup 10 seconds after startup
    setTimeout(() => {
      void this.runCleanup();
    }, 10000);

    // Run cleanup every 6 hours (6 * 60 * 60 * 1000 ms)
    this.intervalId = setInterval(
      () => {
        void this.runCleanup();
      },
      6 * 60 * 60 * 1000,
    );
    this.logger.log('Cleanup Cron Service initialized (runs every 6 hours).');
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async runCleanup(): Promise<void> {
    this.logger.log('Running scheduled cleanup for expired exports...');
    try {
      const now = new Date().toISOString();
      const expiredJobs = await this.databaseService.getExpiredJobs(now);

      if (expiredJobs.length === 0) {
        this.logger.log('No expired export jobs found.');
        return;
      }

      this.logger.log(
        `Found ${expiredJobs.length} expired export jobs. Starting cleanup...`,
      );

      for (const job of expiredJobs) {
        try {
          if (job.zipKey) {
            // Delete file from R2
            await this.storageService.deleteFile(job.zipKey);
          }

          // Mark job as expired in DB
          await this.databaseService.updateJobStatus(job.id, 'expired');
          this.logger.log(`Cleaned up expired job: ${job.id}`);
        } catch (err: unknown) {
          this.logger.error(
            `Failed to clean up expired job ${job.id}:`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }

      this.logger.log('Cleanup process completed.');
    } catch (err: unknown) {
      this.logger.error(
        'Failed during the cleanup cycle:',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
