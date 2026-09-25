'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { ticketConfigService } from '@/services/tickets.service';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';

interface Row {
  id: string;
  name: string;
  color?: string;
  badges?: string[];
  meta?: string;
  removable: boolean;
}

function ConfigCard({
  title,
  description,
  rows,
  loading,
  error,
  onRetry,
  onCreate,
  onRemove,
  placeholder,
  canManage,
  withColour = true,
}: {
  title: string;
  description: string;
  rows: Row[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onCreate: (values: { name: string; color: string }) => void;
  onRemove: (id: string) => void;
  placeholder: string;
  canManage: boolean;
  withColour?: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');
  const inputId = `${title.toLowerCase().replace(/\s+/g, '-')}-name`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={`Unable to load ${title.toLowerCase()}.`} onRetry={onRetry} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2">
                {row.color ? (
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                ) : null}
                <span className="text-sm font-medium">{row.name}</span>
                {row.badges?.map((badge) => (
                  <Badge key={badge} variant="outline">
                    {badge}
                  </Badge>
                ))}
                {row.meta ? (
                  <span className="text-xs text-muted-foreground">{row.meta}</span>
                ) : null}
                {canManage && row.removable ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label={`Delete ${row.name}`}
                    onClick={() => onRemove(row.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              onCreate({ name: name.trim(), color });
              setName('');
            }}
          >
            <div className="min-w-[10rem] flex-1">
              <label htmlFor={inputId} className="sr-only">
                New {title.toLowerCase()} name
              </label>
              <Input
                id={inputId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={placeholder}
              />
            </div>
            {withColour ? (
              <div>
                <label htmlFor={`${inputId}-color`} className="sr-only">
                  Colour
                </label>
                <input
                  id={`${inputId}-color`}
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background"
                />
              </div>
            ) : null}
            <Button type="submit" variant="outline" size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function TicketFieldsSettingsPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((state) => state.can);
  const canManage = can(PERMISSIONS.TICKET_CONFIG);

  const statuses = useQuery({ queryKey: ['ticket-statuses'], queryFn: ticketConfigService.statuses });
  const priorities = useQuery({
    queryKey: ['ticket-priorities'],
    queryFn: ticketConfigService.priorities,
  });
  const categories = useQuery({
    queryKey: ['ticket-categories'],
    queryFn: ticketConfigService.categories,
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: ticketConfigService.tags });

  const run = (fn: () => Promise<unknown>, key: string[], success: string) =>
    fn()
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: key });
        toast.success(success);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof ApiError ? error.message : 'Unable to apply the change.'),
      );

  const invalidateTickets = () => queryClient.invalidateQueries({ queryKey: ['tickets'] });

  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: string; id: string }) => {
      if (kind === 'status') return ticketConfigService.removeStatus(id);
      if (kind === 'priority') return ticketConfigService.removePriority(id);
      if (kind === 'category') return ticketConfigService.removeCategory(id);
      return ticketConfigService.removeTag(id);
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [
          variables.kind === 'tag'
            ? 'tags'
            : variables.kind === 'category'
              ? 'ticket-categories'
              : `ticket-${variables.kind === 'status' ? 'statuses' : 'priorities'}`,
        ],
      });
      await invalidateTickets();
      toast.success('Deleted');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Unable to delete.'),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ConfigCard
        title="Statuses"
        description="Behaviour comes from the flags, not the name: one status is the default, one resolves a ticket and one closes it."
        canManage={canManage}
        loading={statuses.isPending}
        error={statuses.isError}
        onRetry={() => statuses.refetch()}
        placeholder="e.g. Awaiting third party"
        rows={(statuses.data ?? []).map((status) => ({
          id: status.id,
          name: status.name,
          color: status.color,
          badges: [
            ...(status.isDefault ? ['Default'] : []),
            ...(status.isResolved ? ['Resolves'] : []),
            ...(status.isClosed ? ['Closes'] : []),
            ...(status.pausesSla ? ['Pauses SLA'] : []),
            ...(status.isSystem ? ['System'] : []),
          ],
          removable: !status.isDefault,
        }))}
        onCreate={(values) =>
          void run(
            () => ticketConfigService.createStatus({ ...values, position: 99, isDefault: false, isResolved: false, isClosed: false, pausesSla: false }),
            ['ticket-statuses'],
            'Status created',
          )
        }
        onRemove={(id) => remove.mutate({ kind: 'status', id })}
      />

      <ConfigCard
        title="Priorities"
        description="Weight decides which priority wins when automation compares two tickets."
        canManage={canManage}
        loading={priorities.isPending}
        error={priorities.isError}
        onRetry={() => priorities.refetch()}
        placeholder="e.g. Critical"
        rows={(priorities.data ?? []).map((priority) => ({
          id: priority.id,
          name: priority.name,
          color: priority.color,
          badges: [
            ...(priority.isDefault ? ['Default'] : []),
            ...(priority.isSystem ? ['System'] : []),
          ],
          meta: `weight ${priority.weight}`,
          removable: !priority.isDefault,
        }))}
        onCreate={(values) =>
          void run(
            () =>
              ticketConfigService.createPriority({
                ...values,
                weight: 50,
                position: 99,
                isDefault: false,
              }),
            ['ticket-priorities'],
            'Priority created',
          )
        }
        onRemove={(id) => remove.mutate({ kind: 'priority', id })}
      />

      <ConfigCard
        title="Categories"
        description="Used to group tickets for routing and reporting."
        canManage={canManage}
        withColour={false}
        loading={categories.isPending}
        error={categories.isError}
        onRetry={() => categories.refetch()}
        placeholder="e.g. Integrations"
        rows={(categories.data ?? []).map((category) => ({
          id: category.id,
          name: category.name,
          meta: category.description ?? undefined,
          removable: true,
        }))}
        onCreate={(values) =>
          void run(
            () => ticketConfigService.createCategory({ name: values.name, description: null, parentId: null }),
            ['ticket-categories'],
            'Category created',
          )
        }
        onRemove={(id) => remove.mutate({ kind: 'category', id })}
      />

      <ConfigCard
        title="Tags"
        description="Free-form labels agents apply to tickets."
        canManage={canManage}
        loading={tags.isPending}
        error={tags.isError}
        onRetry={() => tags.refetch()}
        placeholder="e.g. billing-escalation"
        rows={(tags.data ?? []).map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          meta: `${tag._count.tickets} ticket${tag._count.tickets === 1 ? '' : 's'}`,
          removable: true,
        }))}
        onCreate={(values) => void run(() => ticketConfigService.createTag(values), ['tags'], 'Tag created')}
        onRemove={(id) => remove.mutate({ kind: 'tag', id })}
      />
    </div>
  );
}
