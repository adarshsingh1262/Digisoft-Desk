import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { ChannelsController } from './channels.controller';
import { ChannelWebhooksController } from './webhooks.controller';
import { ChannelsService } from './channels.service';
import { ChannelWebhookService } from './channel-webhook.service';
import { InboundService } from './inbound.service';
import { ChannelOutboundModule } from './channel-outbound.module';

@Module({
  imports: [TicketsModule, ChannelOutboundModule],
  controllers: [ChannelsController, ChannelWebhooksController],
  providers: [ChannelsService, ChannelWebhookService, InboundService],
  exports: [ChannelsService, InboundService],
})
export class ChannelsModule {}
