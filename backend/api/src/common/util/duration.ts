const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Parses the compact durations used in configuration (`15m`, `2h`, `7d`) into seconds. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Unsupported duration "${value}". Use forms like 15m, 2h, 7d.`);
  }
  const unit = DURATION_UNITS[match[2] as string];
  if (!unit) {
    throw new Error(`Unsupported duration unit in "${value}".`);
  }
  return Number(match[1]) * unit;
}
