import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PERMISSIONS } from '@digisoft/shared';
import { TokenService } from '../auth/token.service';
import { AccessControlService } from '../auth/access-control.service';

export const RT_EVENTS = {
  NOTIFICATION_CREATED: 'notification.created',
  AGENT_ONLINE: 'agent.online',
  AGENT_OFFLINE: 'agent.offline',
} as const;

interface SocketIdentity {
  userId: string;
  organizationId: string;
}

export interface TicketAudienceRooms {
  departmentId: string | null;
  assignedAgentId: string | null;
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

  constructor(
    private readonly tokens: TokenService,
    private readonly accessControl: AccessControlService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
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

    // Room membership mirrors the API's read scope, so a socket can only ever be sent
    // events for tickets its user is allowed to open.
    let user;
    try {
      user = await this.accessControl.resolveUser(result.payload);
    } catch {
      client.disconnect(true);
      return;
    }

    const rooms = [
      orgRoom(identity.organizationId),
      userRoom(identity.organizationId, identity.userId),
      ...user.departmentIds.map((departmentId) =>
        departmentRoom(identity.organizationId, departmentId),
      ),
    ];
    if (user.permissions.includes(PERMISSIONS.TICKET_READ_ALL)) {
      rooms.push(allTicketsRoom(identity.organizationId));
    }

    await client.join(rooms);
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

  /** Fans an event out to everyone entitled to see the ticket, and no one else. */
  emitToTicketAudience(
    organizationId: string,
    audience: TicketAudienceRooms,
    event: string,
    payload: unknown,
  ): void {
    if (!this.server) {
      this.logger.warn(`Realtime server not ready; dropped ${event}`);
      return;
    }
    const rooms = [allTicketsRoom(organizationId)];
    if (audience.departmentId) {
      rooms.push(departmentRoom(organizationId, audience.departmentId));
    }
    if (audience.assignedAgentId) {
      rooms.push(userRoom(organizationId, audience.assignedAgentId));
    }
    // Socket.IO de-duplicates a socket that belongs to more than one of these rooms.
    this.server.to(rooms).emit(event, payload);
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
export const departmentRoom = (organizationId: string, departmentId: string): string =>
  `org:${organizationId}:dept:${departmentId}`;
/** Joined only by users who may read every ticket in the organization. */
export const allTicketsRoom = (organizationId: string): string =>
  `org:${organizationId}:tickets:all`;
