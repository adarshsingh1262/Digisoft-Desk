'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { PERMISSIONS } from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { contactsService } from '@/services/contacts.service';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { ContactFormDialog } from '@/components/customers/contact-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{children}</dd>
    </div>
  );
}

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const can = useAuthStore((state) => state.can);
  const [editOpen, setEditOpen] = useState(false);

  const contact = useQuery({
    queryKey: ['contacts', params.id],
    queryFn: () => contactsService.get(params.id),
  });

  if (contact.isPending) {
    return <LoadingState label="Loading contact…" />;
  }

  if (contact.isError) {
    const notFound = contact.error instanceof ApiError && contact.error.status === 404;
    return (
      <ErrorState
        message={notFound ? 'This contact does not exist in your organization.' : 'Unable to load the contact.'}
        onRetry={notFound ? undefined : () => contact.refetch()}
      />
    );
  }

  const data = contact.data;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => router.push('/customers')} className="-ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to customers
      </Button>

      <PageHeader
        title={`${data.firstName} ${data.lastName ?? ''}`.trim()}
        description={data.jobTitle ?? undefined}
        actions={
          can(PERMISSIONS.CONTACT_UPDATE) ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <DetailRow label="Email">{data.email ?? '—'}</DetailRow>
              <DetailRow label="Phone">{data.phone ?? '—'}</DetailRow>
              <DetailRow label="Mobile">{data.mobile ?? '—'}</DetailRow>
              <DetailRow label="Status">
                <Badge variant={data.status === 'ACTIVE' ? 'success' : 'default'}>
                  {data.status.charAt(0) + data.status.slice(1).toLowerCase()}
                </Badge>
                {data.isVip ? (
                  <Badge variant="warning" className="ml-2">
                    VIP
                  </Badge>
                ) : null}
              </DetailRow>
              <DetailRow label="Account">
                {data.account ? (
                  <Link href={`/accounts/${data.account.id}`} className="hover:underline">
                    {data.account.name}
                  </Link>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Created">{formatDateTime(data.createdAt)}</DetailRow>
              <DetailRow label="Last updated">{formatDateTime(data.updatedAt)}</DetailRow>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets & activity</CardTitle>
            <CardDescription>Arrives with the ticketing module in Phase 2.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This contact has no ticket history yet because ticketing is not implemented.
          </CardContent>
        </Card>
      </div>

      <ContactFormDialog open={editOpen} onOpenChange={setEditOpen} contact={data} />
    </>
  );
}
