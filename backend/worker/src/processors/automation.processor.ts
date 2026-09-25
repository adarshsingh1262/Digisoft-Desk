import type { Job } from 'bullmq';
import { runTrigger, type EngineDeps, type TriggerJob } from '@digisoft/engine';

/** Evaluates automation and escalation rules for one ticket event. */
export async function handleAutomation(job: Job<TriggerJob>, deps: EngineDeps) {
  const result = await runTrigger(deps, job.data);
  deps.log('info', `Automation ${job.data.trigger} on ${job.data.ticketId}: ${result.fired}/${result.evaluated} fired`, {
    organizationId: job.data.organizationId,
  });
  return result;
}
