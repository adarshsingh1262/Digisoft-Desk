import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeBridge } from './realtime.bridge';

@Global()
@Module({
  providers: [RealtimeGateway, RealtimeBridge],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
