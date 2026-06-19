import { Module } from '@nestjs/common';
import { MisskeyService } from './misskey.service';

@Module({
  providers: [MisskeyService],
  exports: [MisskeyService],
})
export class MisskeyModule {}
