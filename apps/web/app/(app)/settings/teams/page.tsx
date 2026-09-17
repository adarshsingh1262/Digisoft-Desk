'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERMISSIONS,
  createTeamSchema,
  type CreateTeamInput,
  type TeamFormValues,
} from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { departmentsService, teamsService, usersService } from '@/services/settings.service';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { DataTable, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';

export default function TeamsSettingsPage() {
  const can = useAuthStore((state) => state.can);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const teams = useQuery({ queryKey: ['teams'], queryFn: teamsService.list });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: departmentsService.list,
    enabled: open,
  });
  const agents = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => usersService.list({ page: 1, pageSize: 100, isActive: true }),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues, unknown, CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { memberIds: [] },
  });

  const create = useMutation({
    mutationFn: (values: CreateTeamInput) => teamsService.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team created');
      reset({ name: '', description: '', departmentId: '', memberIds: [] });
      setOpen(false);
    },
    onError: (error) =>
      setError('root', {
        message: error instanceof ApiError ? error.message : 'Unable to create the team.',
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => teamsService.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Team deleted');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Unable to delete the team.'),
  });

  return (
    <>
      <div className="flex justify-end">
        {can(PERMISSIONS.TEAM_MANAGE) ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New team
          </Button>
        ) : null}
      </div>

      <Card>
        {teams.isPending ? (
          <TableSkeleton columns={3} />
        ) : teams.isError ? (
          <ErrorState
            message={teams.error instanceof ApiError ? teams.error.message : 'Unable to load teams.'}
            onRetry={() => teams.refetch()}
          />
        ) : teams.data.length === 0 ? (
          <EmptyState
            title="No teams yet"
            description="Teams group agents inside a department and can be assigned work as a unit."
          />
        ) : (
          <DataTable>
            <THead>
              <TR>
                <TH>Team</TH>
                <TH>Department</TH>
                <TH>Members</TH>
                <TH><span className="sr-only">Actions</span></TH>
              </TR>
            </THead>
            <TBody>
              {teams.data.map((team) => (
                <TR key={team.id}>
                  <TD>
                    <p className="font-medium">{team.name}</p>
                    {team.description ? (
                      <p className="text-xs text-muted-foreground">{team.description}</p>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">{team.department?.name ?? '—'}</TD>
                  <TD className="text-muted-foreground">
                    {team.members.map((member) => `${member.user.firstName} ${member.user.lastName}`).join(', ') || '—'}
                  </TD>
                  <TD className="text-right">
                    {can(PERMISSIONS.TEAM_MANAGE) ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${team.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete ${team.name}?`)) {
                            remove.mutate(team.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((values) => create.mutateAsync(values))}
            className="space-y-4"
            noValidate
          >
            <Field label="Name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus {...register('name')} />
            </Field>

            <Field label="Department" htmlFor="departmentId" error={errors.departmentId?.message}>
              <Select {...register('departmentId')} disabled={departments.isPending}>
                <option value="">No department</option>
                {departments.data?.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea rows={2} {...register('description')} />
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Members</legend>
              {agents.isPending ? (
                <p className="text-sm text-muted-foreground">Loading agents…</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {agents.data?.items.map((agent) => (
                    <label key={agent.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        value={agent.id}
                        {...register('memberIds')}
                      />
                      {agent.firstName} {agent.lastName}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            {errors.root ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.root.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Create team
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
