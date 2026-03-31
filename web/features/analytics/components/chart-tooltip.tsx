'use client';

interface TooltipPayload {
  name: string;
  value: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  valueFormatter?: (value: number | string) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (value) => String(value),
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-sm">
          <span style={{ color: p.color }}>{p.name}:</span>{' '}
          <span className="font-medium">{valueFormatter(p.value)}</span>
        </p>
      ))}
    </div>
  );
}
