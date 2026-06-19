import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { MisskeyModule } from './misskey/misskey.module';
import { ExportModule } from './export/export.module';
import { CleanupModule } from './cleanup/cleanup.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    MisskeyModule,
    ExportModule,
    CleanupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
