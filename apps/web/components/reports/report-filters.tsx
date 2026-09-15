'use client';

import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS, REPORT_RANGES, type AnalyticsQuery, type ReportRange } from '@digisoft/shared';
import { departmentsService, usersService } from '@/services/settings.service';
import { useAuthStore } from '@/stores/auth.store';
import { Select, Input } from '@/components/ui/input';

const RANGE_LABELS: Record<ReportRange, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom range',
};

export interface ReportFilterValue {
  range: ReportRange;
  from?: string;
  to?: string;
  departmentId?: string;
  agentId?: string;
}

/**
 * The one filter bar every report screen shares. Department and agent options come
 * from the same lists the settings screens use, so a filter never names something the
 * viewer cannot otherwise see.
 */
export function ReportFilters({
  value,
  onChange,
}: {
  value: ReportFilterValue;
  onChange: (value: ReportFilterValue) => void;
}) {
  const can = useAuthStore((state) => state.can);

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: departmentsService.list,
    enabled: can(PERMISSIONS.DEPARTMENT_READ),
  });
  const agents = useQuery({
    queryKey: ['users', { pageSize: 100, isActive: true }],
    queryFn: () => usersService.list({ page: 1, pageSize: 100, isActive: true }),
    enabled: can(PERMISSIONS.USER_READ),
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Range
        <Select
          className="w-40"
          value={value.range}
          onChange={(event) =>
            onChange({ ...value, range: event.target.value as ReportRange })
          }
        >
          {REPORT_RANGES.map((range) => (
            <option key={range} value={range}>
              {RANGE_LABELS[range]}
            </option>
          ))}
        </Select>
      </label>

      {value.range === 'custom' ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <Input
              type="date"
              className="w-36"
              value={value.from ?? ''}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <Input
              type="date"
              className="w-36"
              value={value.to ?? ''}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
            />
          </label>
        </>
      ) : null}

      {departments.data && departments.data.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Department
          <Select
            className="w-44"
            value={value.departmentId ?? ''}
            onChange={(event) =>
              onChange({ ...value, departmentId: event.target.value || undefined })
            }
          >
            <option value="">All departments</option>
            {departments.data.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      {agents.data && agents.data.items.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Agent
          <Select
            className="w-44"
            value={value.agentId ?? ''}
            onChange={(event) => onChange({ ...value, agentId: event.target.value || undefined })}
          >
            <option value="">All agents</option>
            {agents.data.items.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.firstName} {agent.lastName}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
    </div>
  );
}

export function toQuery(value: ReportFilterValue): Partial<AnalyticsQuery> {
  return {
    range: value.range,
    ...(value.range === 'custom' ? { from: value.from, to: value.to } : {}),
    ...(value.departmentId ? { departmentId: value.departmentId } : {}),
    ...(value.agentId ? { agentId: value.agentId } : {}),
  };
}
