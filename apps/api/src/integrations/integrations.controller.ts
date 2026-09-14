import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  WEBHOOK_EVENTS,
  apiKeySchema,
  listWebhookDeliveriesQuerySchema,
  updateWebhookEndpointSchema,
  webhookEndpointSchema,
  type ApiKeyInput,
  type AuthenticatedUser,
  type ListWebhookDeliveriesQuery,
  type UpdateWebhookEndpointInput,
  type WebhookEndpointInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { WebhooksService } from './webhooks.service';
import { ApiKeysService } from './api-keys.service';

@Controller()
export class IntegrationsController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  @RequirePermissions(PERMISSIONS.WEBHOOK_READ)
  @Get('webhook-endpoints/events')
  events() {
    return { events: WEBHOOK_EVENTS };
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_READ)
  @Get('webhook-endpoints')
  list() {
    return this.webhooks.list();
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_MANAGE)
  @Post('webhook-endpoints')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(webhookEndpointSchema)) dto: WebhookEndpointInput,
  ) {
    return this.webhooks.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_MANAGE)
  @Patch('webhook-endpoints/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateWebhookEndpointSchema)) dto: UpdateWebhookEndpointInput,
  ) {
    return this.webhooks.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_MANAGE)
  @Post('webhook-endpoints/:id/rotate-secret')
  rotate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooks.rotateSecret(id, user);
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_MANAGE)
  @Post('webhook-endpoints/:id/test')
  test(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooks.test(id, user);
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_MANAGE)
  @Delete('webhook-endpoints/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.webhooks.remove(id, user);
    return { deleted: true };
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_READ)
  @Get('webhook-deliveries')
  deliveries(@Query(zodBody(listWebhookDeliveriesQuerySchema)) query: ListWebhookDeliveriesQuery) {
    return this.webhooks.deliveries(query);
  }

  @RequirePermissions(PERMISSIONS.WEBHOOK_MANAGE)
  @Post('webhook-deliveries/:id/replay')
  replay(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.webhooks.replay(id, user);
  }

  @RequirePermissions(PERMISSIONS.APIKEY_MANAGE)
  @Get('api-keys')
  listKeys() {
    return this.apiKeys.list();
  }

  @RequirePermissions(PERMISSIONS.APIKEY_MANAGE)
  @Post('api-keys')
  createKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(apiKeySchema)) dto: ApiKeyInput,
  ) {
    return this.apiKeys.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.APIKEY_MANAGE)
  @Delete('api-keys/:id')
  revokeKey(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.apiKeys.revoke(id, user);
  }
}
