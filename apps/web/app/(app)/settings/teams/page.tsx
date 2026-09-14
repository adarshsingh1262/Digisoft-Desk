'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { teamsService } from '@/services/settings.service';
import { Card } from '@/components/ui/card';
import { DataTable, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';

export default function TeamsSettingsPage() {
  const teams = useQuery({ queryKey: ['teams'], queryFn: teamsService.list });

  return (
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
          description="Teams group agents inside a department. They can be created through the API; a builder UI arrives with assignment rules in Phase 3."
        />
      ) : (
        <DataTable>
          <THead>
            <TR>
              <TH>Team</TH>
              <TH>Department</TH>
              <TH>Members</TH>
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
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </Card>
  );
}
