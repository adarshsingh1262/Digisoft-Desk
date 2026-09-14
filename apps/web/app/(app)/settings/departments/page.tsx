'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERMISSIONS,
  createDepartmentSchema,
  type CreateDepartmentInput,
  type DepartmentFormValues,
} from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { departmentsService } from '@/services/settings.service';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
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

export default function DepartmentsSettingsPage() {
  const can = useAuthStore((state) => state.can);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsService.list });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormValues, unknown, CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
  });

  const create = useMutation({
    mutationFn: (values: CreateDepartmentInput) => departmentsService.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department created');
      reset({ name: '', description: '', email: '' });
      setOpen(false);
    },
    onError: (error) =>
      setError('root', {
        message: error instanceof ApiError ? error.message : 'Unable to create the department.',
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => departmentsService.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department deleted');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Unable to delete the department.'),
  });

  return (
    <>
      <div className="flex justify-end">
        {can(PERMISSIONS.DEPARTMENT_MANAGE) ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New department
          </Button>
        ) : null}
      </div>

      <Card>
        {departments.isPending ? (
          <TableSkeleton columns={4} />
        ) : departments.isError ? (
          <ErrorState message="Unable to load departments." onRetry={() => departments.refetch()} />
        ) : departments.data.length === 0 ? (
          <EmptyState title="No departments yet" description="Departments group agents and route work." />
        ) : (
          <DataTable>
            <THead>
              <TR>
                <TH>Department</TH>
                <TH>Email</TH>
                <TH className="text-right">Agents</TH>
                <TH className="text-right">Teams</TH>
                <TH><span className="sr-only">Actions</span></TH>
              </TR>
            </THead>
            <TBody>
              {departments.data.map((department) => (
                <TR key={department.id}>
                  <TD>
                    <p className="font-medium">
                      {department.name}
                      {department.isDefault ? (
                        <Badge variant="outline" className="ml-2">
                          Default
                        </Badge>
                      ) : null}
                    </p>
                    {department.description ? (
                      <p className="text-xs text-muted-foreground">{department.description}</p>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">{department.email ?? '—'}</TD>
                  <TD className="text-right tabular-nums">{department._count.members}</TD>
                  <TD className="text-right tabular-nums">{department._count.teams}</TD>
                  <TD className="text-right">
                    {can(PERMISSIONS.DEPARTMENT_MANAGE) && !department.isDefault ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${department.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete ${department.name}?`)) {
                            remove.mutate(department.id);
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
            <DialogTitle>New department</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((values) => create.mutateAsync(values))}
            className="space-y-4"
            noValidate
          >
            <Field label="Name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus {...register('name')} />
            </Field>
            <Field
              label="Support email"
              htmlFor="email"
              error={errors.email?.message}
              hint="Used to route inbound email from Phase 5."
            >
              <Input type="email" {...register('email')} />
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea rows={2} {...register('description')} />
            </Field>
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
                Create department
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
