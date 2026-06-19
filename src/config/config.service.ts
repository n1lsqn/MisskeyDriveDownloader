import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly nestConfigService: NestConfigService) { }

  get port(): number {
    return this.nestConfigService.get<number>('PORT', 3000);
  }

  get redisHost(): string {
    return this.nestConfigService.get<string>('REDIS_HOST', 'localhost');
  }

  get redisPort(): number {
    return this.nestConfigService.get<number>('REDIS_PORT', 6379);
  }

  get r2Endpoint(): string {
    return this.nestConfigService.get<string>(
      'R2_ENDPOINT',
      'http://localhost:9000',
    );
  }

  get r2AccessKeyId(): string {
    return this.nestConfigService.get<string>('R2_ACCESS_KEY_ID', 'minioadmin');
  }

  get r2SecretAccessKey(): string {
    return this.nestConfigService.get<string>(
      'R2_SECRET_ACCESS_KEY',
      'minioadmin',
    );
  }

  get r2BucketName(): string {
    return this.nestConfigService.get<string>(
      'R2_BUCKET_NAME',
      'misskey-exports',
    );
  }

  get r2ForcePathStyle(): boolean {
    const val = this.nestConfigService.get<string>(
      'R2_FORCE_PATH_STYLE',
      'true',
    );
    return val === 'true' || val === '1';
  }

  get misskeyInstanceUrl(): string {
    const url = this.nestConfigService.get<string>(
      'MISSKEY_INSTANCE_URL',
      'https://papi.n1l.dev',
    );
    // Remove trailing slash if present
    return url.replace(/\/$/, '');
  }

  get misskeyApiToken(): string {
    return this.nestConfigService.get<string>('MISSKEY_API_TOKEN', '');
  }
}
