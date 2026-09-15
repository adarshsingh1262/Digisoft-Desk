'use client';

/**
 * A small inline-SVG line chart. No charting library: the product's own convention is
 * dense, unadorned data, and a handful of trend lines does not earn a dependency.
 */
export function TrendChart<T extends { day: string }>({
  data,
  series,
  height = 160,
}: {
  data: T[];
  series: { key: keyof T & string; label: string; colour: string }[];
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data in this range.</p>;
  }

  const width = 640;
  const padding = 24;
  const max = Math.max(1, ...data.flatMap((point) => series.map((s) => Number(point[s.key]) || 0)));
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const scaleY = (value: number) => height - padding - (value / max) * (height - padding * 2);

  const path = (key: keyof T & string) =>
    data
      .map((point, index) => {
        const x = padding + index * stepX;
        const y = scaleY(Number(point[key]) || 0);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  // Thin every label out so a 90-day range does not overlap its own tick marks.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend over time">
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="stroke-border"
          strokeWidth={1}
        />
        {series.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.colour} strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.colour }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {data
          .filter((_, index) => index % labelEvery === 0 || index === data.length - 1)
          .map((point, index) => (
            <span key={index}>{String(point.day ?? '').slice(5)}</span>
          ))}
      </div>
    </div>
  );
}

/** A horizontal bar breakdown — priority, status, channel, department counts. */
export function BarBreakdown({
  rows,
  colourFor,
}: {
  rows: { label: string; count: number }[];
  colourFor?: (label: string) => string | undefined;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing in this range.</p>;
  }
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-muted-foreground">{row.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(row.count / max) * 100}%`,
                backgroundColor: colourFor?.(row.label) ?? 'hsl(var(--primary))',
              }}
            />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}
