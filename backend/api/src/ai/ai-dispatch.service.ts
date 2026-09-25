import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AI_QUEUE_TOKEN } from '../queue/queue.module';
import { AI_ANALYSE_JOB, type AiAnalyseJob } from '../queue/queue.constants';

/**
 * Asks the worker to analyse a ticket. Deliberately fire-and-forget: the assistant is
 * an aid, and a queue that is briefly unavailable must never fail the ticket that
 * triggered it.
 */
@Injectable()
export class AiDispatchService {
  private readonly logger = new Logger(AiDispatchService.name);

  constructor(@Inject(AI_QUEUE_TOKEN) private readonly queue: Queue<AiAnalyseJob>) {}

  async analyse(
    organizationId: string,
    ticketId: string,
    reason: AiAnalyseJob['reason'],
  ): Promise<void> {
    try {
      await this.queue.add(
        AI_ANALYSE_JOB,
        { organizationId, ticketId, reason },
        // One analysis per ticket per reason per minute, however many events land.
        { jobId: `ai-${ticketId}-${reason}-${Math.floor(Date.now() / 60_000)}` },
      );
    } catch (error) {
      this.logger.warn(
        `Could not queue AI analysis for ${ticketId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
