import { Injectable, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/status'
})
export class StatusGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(StatusGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`WS client disconnected: ${client.id}`);
  }

  /** Client subscribes to events for their organization. */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { organizationId: string },
    @ConnectedSocket() client: Socket
  ) {
    if (data?.organizationId) {
      void client.join(`org:${data.organizationId}`);
    }
  }

  /** Client unsubscribes from an organization room. */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { organizationId: string },
    @ConnectedSocket() client: Socket
  ) {
    if (data?.organizationId) {
      void client.leave(`org:${data.organizationId}`);
    }
  }

  // ─── Server-side emitters called by processors ────────────────────────────────

  emitVpsUpdate(organizationId: string, payload: Record<string, unknown>) {
    this.server?.to(`org:${organizationId}`).emit('vps:update', payload);
  }

  emitDomainUpdate(organizationId: string, payload: Record<string, unknown>) {
    this.server?.to(`org:${organizationId}`).emit('domain:update', payload);
  }

  emitDeploymentUpdate(organizationId: string, payload: Record<string, unknown>) {
    this.server?.to(`org:${organizationId}`).emit('deployment:update', payload);
  }
}
