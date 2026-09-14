import { Global, Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { AgentChatController, PortalChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PortalGuard } from '../portal/portal.guard';

/**
 * Global so an agent's reply can be pushed to the visitor's socket from the outbound
 * path without the ticket module importing chat.
 */
@Global()
@Module({
  imports: [TicketsModule],
  controllers: [PortalChatController, AgentChatController],
  providers: [ChatService, ChatGateway, PortalGuard],
  exports: [ChatService],
})
export class ChatModule {}
