export * from './deps';
export * from './conditions';
export * from './business-hours';
export * from './facts';
export * from './templates';
export * from './assignment';
export * from './sla';
export * from './actions';
export * from './automation';
export * from './blueprint';

/** Queue names and job shapes shared by the API (producer) and the worker (consumer). */
export const AUTOMATION_QUEUE = 'automation';
export const AUTOMATION_JOB = 'run-trigger';
export const SLA_QUEUE = 'sla';
export const SLA_SCAN_JOB = 'scan';
