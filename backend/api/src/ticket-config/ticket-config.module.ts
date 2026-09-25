import { Module } from '@nestjs/common';
import { TicketConfigController } from './ticket-config.controller';
import { TicketConfigService } from './ticket-config.service';

@Module({
  controllers: [TicketConfigController],
  providers: [TicketConfigService],
  exports: [TicketConfigService],
})
export class TicketConfigModule {}
