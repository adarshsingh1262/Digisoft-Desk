import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';

export const RT_EVENTS = {
  NOTIFICATION_CREATED: 'notification.created',
  AGENT_ONLINE: 'agent.online',
  AGENT_OFFLINE: 'agent.offline',
} as const;

interface SocketIdentity {
  userId: string;
  organizationId: string;
}

/**
 * Authenticated realtime channel. Every socket joins only its own organization and
 * user rooms, so a broadcast can never cross a tenant boundary.
 */
@WebSocketGateway({ namespace: '/rt', cors: { credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly tokens: TokenService) {}

  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth as { token?: string } | undefined)?.token ??
      (typeof client.handshake.query.token === 'string' ? client.handshake.query.token : undefined);

    if (!token) {
      client.disconnect(true);
      return;
    }

    const result = this.tokens.verifyAccessToken(token);
    if (!result.ok) {
      client.disconnect(true);
      return;
    }

    const identity: SocketIdentity = {
      userId: result.payload.sub,
      organizationId: result.payload.org,
    };
    client.data.identity = identity;

    void client.join([orgRoom(identity.organizationId), userRoom(identity.organizationId, identity.userId)]);
    this.server
      .to(orgRoom(identity.organizationId))
      .emit(RT_EVENTS.AGENT_ONLINE, { userId: identity.userId });
  }

  handleDisconnect(client: Socket): void {
    const identity = client.data.identity as SocketIdentity | undefined;
    if (!identity) {
      return;
    }
    this.server
      .to(orgRoom(identity.organizationId))
      .emit(RT_EVENTS.AGENT_OFFLINE, { userId: identity.userId });
  }

  emitToUser(organizationId: string, userId: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Realtime server not ready; dropped ${event}`);
      return;
    }
    this.server.to(userRoom(organizationId, userId)).emit(event, payload);
  }

  emitToOrganization(organizationId: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Realtime server not ready; dropped ${event}`);
      return;
    }
    this.server.to(orgRoom(organizationId)).emit(event, payload);
  }
}

export const orgRoom = (organizationId: string): string => `org:${organizationId}`;
export const userRoom = (organizationId: string, userId: string): string =>
  `org:${organizationId}:user:${userId}`;
