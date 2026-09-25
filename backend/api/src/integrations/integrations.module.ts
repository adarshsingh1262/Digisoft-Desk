import { Global, Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyStrategy } from './api-key.strategy';

/**
 * Global so any service can dispatch an event and the auth layer can resolve an API
 * key, without every module importing this one.
 */
@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [WebhooksService, WebhookDispatcherService, ApiKeysService, ApiKeyStrategy],
  exports: [WebhookDispatcherService, ApiKeyStrategy],
})
export class IntegrationsModule {}
