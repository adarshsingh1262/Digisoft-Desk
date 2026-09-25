import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfig } from '../config/config.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [
    TicketsModule,
    MulterModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        // Buffered in memory and handed to the storage provider; the multer limit is a
        // second line of defence behind the service's own size check.
        storage: memoryStorage(),
        limits: { fileSize: config.get('ATTACHMENT_MAX_BYTES'), files: 1 },
      }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
