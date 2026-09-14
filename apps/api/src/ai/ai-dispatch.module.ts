import { Global, Module } from '@nestjs/common';
import { AiDispatchService } from './ai-dispatch.service';

/**
 * Global and dependency-free so the ticket conversation can ask for analysis without
 * importing the AI module — which imports tickets back.
 */
@Global()
@Module({
  providers: [AiDispatchService],
  exports: [AiDispatchService],
})
export class AiDispatchModule {}
