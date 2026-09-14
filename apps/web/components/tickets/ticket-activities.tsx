'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Plus } from 'lucide-react';
import { PERMISSIONS } from '@digisoft/shared';
import { activitiesService } from '@/services/activities.service';
import { useAuthStore } from '@/stores/auth.store';
import type { TicketDetail } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ActivityList } from '@/components/activities/activity-list';
import { ActivityFormDialog } from '@/components/activities/activity-form-dialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

export function TicketActivities({ ticket }: { ticket: TicketDetail }) {
  const can = useAuthStore((state) => state.can);
  const [dialog, setDialog] = useState<{ open: boolean; type: 'TASK' | 'CALL' | 'EVENT' }>({ open: false, type: 'TASK' });
  const activities = useQuery({
    queryKey: ['activities', { ticketId: ticket.id }],
    queryFn: () => activitiesService.list({ ticketId: ticket.id, page: 1, pageSize: 50, sort: 'createdAt', order: 'desc' }),
  });

  return (
    <div className="space-y-3 p-4">
      {can(PERMISSIONS.ACTIVITY_CREATE) ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, type: 'TASK' })}><Plus className="h-4 w-4" aria-hidden />Task</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, type: 'CALL' })}><Phone className="h-4 w-4" aria-hidden />Log call</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, type: 'EVENT' })}><Plus className="h-4 w-4" aria-hidden />Event</Button>
        </div>
      ) : null}
      {activities.isPending ? <LoadingState /> : activities.isError ? (
        <ErrorState message="Unable to load activities." onRetry={() => activities.refetch()} />
      ) : activities.data.items.length === 0 ? (
        <EmptyState title="No activities on this ticket" description="Tasks, calls and events you log here stay attached to the ticket." />
      ) : (
        <ActivityList activities={activities.data.items} showTicket={false} />
      )}
      <ActivityFormDialog open={dialog.open} onOpenChange={(open) => setDialog({ ...dialog, open })} ticketId={ticket.id} contactId={ticket.contact?.id ?? null} defaultType={dialog.type} />
    </div>
  );
}
