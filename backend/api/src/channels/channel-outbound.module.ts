import { Global, Module } from '@nestjs/common';
import { ChannelSecretsService } from './channel-secrets.service';
import { ChannelOutboundService } from './channel-outbound.service';

/**
 * Outbound delivery is global so the ticket conversation can hand a reply to its
 * channel without importing the channel module — which would import tickets back.
 */
@Global()
@Module({
  providers: [ChannelSecretsService, ChannelOutboundService],
  exports: [ChannelSecretsService, ChannelOutboundService],
})
export class ChannelOutboundModule {}
