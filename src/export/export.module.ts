import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportProcessor } from './export.processor';
import { MisskeyModule } from '../misskey/misskey.module';

@Module({
  imports: [MisskeyModule],
  providers: [ExportService, ExportProcessor],
  exports: [ExportService],
})
export class ExportModule {}
