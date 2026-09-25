import { Module } from '@nestjs/common';
import { TicketConfigModule } from '../ticket-config/ticket-config.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketMessagesService } from './ticket-messages.service';
import { TicketEventsService } from './ticket-events.service';

@Module({
  imports: [TicketConfigModule, NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketMessagesService, TicketEventsService],
  exports: [TicketsService, TicketMessagesService],
})
export class TicketsModule {}
