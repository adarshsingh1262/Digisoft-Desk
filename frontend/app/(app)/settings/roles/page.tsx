'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERMISSIONS,
  createRoleSchema,
  type CreateRoleInput,
  type RoleFormValues,
} from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { rolesService } from '@/services/settings.service';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/ui/states';

export default function RolesSettingsPage() {
  const can = useAuthStore((state) => state.can);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const canManage = can(PERMISSIONS.ROLE_MANAGE);

  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesService.list });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: rolesService.permissions });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoleFormValues, unknown, CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { permissionKeys: [] },
  });

  const create = useMutation({
    mutationFn: (values: CreateRoleInput) => rolesService.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role created');
      reset({ name: '', description: '', permissionKeys: [] });
      setOpen(false);
    },
    onError: (error) =>
      setError('root', {
        message: error instanceof ApiError ? error.message : 'Unable to create the role.',
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => rolesService.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role deleted');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Unable to delete the role.'),
  });

  if (roles.isPending) return <LoadingState />;
  if (roles.isError) {
    return (
      <ErrorState
        message={roles.error instanceof ApiError ? roles.error.message : 'Unable to load roles.'}
        onRetry={() => roles.refetch()}
      />
    );
  }

  return (
    <>
      <div className="flex justify-end">
        {canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New role
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.data.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{role.name}</CardTitle>
                <div className="flex items-center gap-1">
                  {role.isSystem ? <Badge variant="outline">System</Badge> : null}
                  {canManage && !role.isSystem ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${role.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${role.name}?`)) {
                          remove.mutate(role.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </div>
              <CardDescription>{role.description ?? 'No description'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {role._count.users} {role._count.users === 1 ? 'agent' : 'agents'} ·{' '}
                {role.permissions.length} permissions
              </p>
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 8).map((entry) => (
                  <Badge key={entry.permission.key} className="font-mono text-[10px]">
                    {entry.permission.key}
                  </Badge>
                ))}
                {role.permissions.length > 8 ? (
                  <Badge variant="outline">+{role.permissions.length - 8} more</Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission catalogue</CardTitle>
          <CardDescription>Every key the backend authorises against.</CardDescription>
        </CardHeader>
        <CardContent>
          {permissions.isPending ? (
            <LoadingState />
          ) : permissions.isError ? (
            <ErrorState message="Unable to load permissions." onRetry={() => permissions.refetch()} />
          ) : (
            <div className="flex flex-wrap gap-1">
              {permissions.data.map((permission) => (
                <Badge key={permission.key} variant="outline" className="font-mono text-[10px]">
                  {permission.key}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((values) => create.mutateAsync(values))}
            className="space-y-4"
            noValidate
          >
            <Field label="Name" htmlFor="name" error={errors.name?.message} required>
              <Input autoFocus {...register('name')} />
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea rows={2} {...register('description')} />
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Permissions</legend>
              {permissions.isPending ? (
                <p className="text-sm text-muted-foreground">Loading permissions…</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {permissions.data?.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        value={permission.key}
                        {...register('permissionKeys')}
                      />
                      <span className="font-mono text-xs">{permission.key}</span>
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
                Create role
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
