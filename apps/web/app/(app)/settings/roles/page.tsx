'use client';

import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { rolesService } from '@/services/settings.service';
import { useAuthStore } from '@/stores/auth.store';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';

export default function RolesSettingsPage() {
  const can = useAuthStore((state) => state.can);
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesService.list });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: rolesService.permissions });

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.data.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{role.name}</CardTitle>
                {role.isSystem ? <Badge variant="outline">System</Badge> : null}
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
          <CardDescription>
            Every key the backend authorises against.
            {can(PERMISSIONS.ROLE_MANAGE)
              ? ' Custom roles can be created through the API; a builder UI is not part of Phase 1.'
              : ''}
          </CardDescription>
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
    </>
  );
}
