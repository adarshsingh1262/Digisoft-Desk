'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Lock, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { downloadAttachment, ticketsService } from '@/services/tickets.service';
import { cn, formatDateTime, initials } from '@/lib/utils';
import type { TicketAttachment, TicketDetail, TicketMessage } from '@/types/api';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentList({ attachments }: { attachments: TicketAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {attachments.map((file) => (
        <li key={file.id}>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadAttachment(file.id, file.fileName).catch((error: unknown) =>
                toast.error(
                  error instanceof ApiError ? error.message : 'Unable to download the file.',
                ),
              )
            }
          >
            <Paperclip className="h-3 w-3" aria-hidden />
            {file.fileName}
            <span className="text-muted-foreground">{formatBytes(file.fileSize)}</span>
            <Download className="h-3 w-3" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function authorName(message: TicketMessage): string {
  if (message.authorUser) {
    return `${message.authorUser.firstName} ${message.authorUser.lastName}`;
  }
  if (message.authorContact) {
    return `${message.authorContact.firstName} ${message.authorContact.lastName ?? ''}`.trim();
  }
  return 'System';
}

function MessageBubble({ message }: { message: TicketMessage }) {
  const internal = message.type === 'INTERNAL_COMMENT';
  const system = message.type === 'SYSTEM_NOTE';
  const fromCustomer = message.direction === 'INBOUND';

  if (system) {
    return (
      <li className="py-2 text-center text-xs text-muted-foreground">
        {message.bodyText} · {formatDateTime(message.createdAt)}
      </li>
    );
  }

  return (
    <li
      className={cn(
        'rounded-lg border p-3',
        internal
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
          : fromCustomer
            ? 'border-border bg-muted/50'
            : 'border-border bg-background',
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
          aria-hidden
        >
          {initials(authorName(message).charAt(0), authorName(message).split(' ')[1] ?? '')}
        </span>
        <span className="text-sm font-medium">{authorName(message)}</span>
        {internal ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            <Lock className="h-2.5 w-2.5" aria-hidden />
            Internal
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {fromCustomer ? 'From customer' : 'Public reply'}
          </span>
        )}
        <time className="ml-auto text-xs text-muted-foreground" dateTime={message.createdAt}>
          {formatDateTime(message.createdAt)}
        </time>
      </div>
      <p className="whitespace-pre-line text-sm">{message.bodyText}</p>
      <AttachmentList attachments={message.attachments} />
    </li>
  );
}

export function TicketConversation({ ticket }: { ticket: TicketDetail }) {
  const messages = useQuery({
    queryKey: ['ticket', ticket.id, 'messages'],
    queryFn: () => ticketsService.messages(ticket.id),
  });

  const unattached = useQuery({
    queryKey: ['ticket', ticket.id, 'attachments'],
    queryFn: () => ticketsService.attachments(ticket.id),
  });

  const looseFiles = (unattached.data ?? []).filter((file) => file.messageId === null);

  return (
    <div className="space-y-3 p-4">
      <article className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {ticket.contact
              ? `${ticket.contact.firstName} ${ticket.contact.lastName ?? ''}`.trim()
              : (ticket.createdBy &&
                  `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`) ||
                'Unknown requester'}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Original request · {ticket.source.toLowerCase().replace('_', ' ')}
          </span>
          <time className="ml-auto text-xs text-muted-foreground" dateTime={ticket.createdAt}>
            {formatDateTime(ticket.createdAt)}
          </time>
        </div>
        <p className="whitespace-pre-line text-sm">{ticket.description}</p>
        {looseFiles.length > 0 ? <AttachmentList attachments={looseFiles} /> : null}
      </article>

      {messages.isPending ? (
        <LoadingState label="Loading conversation…" />
      ) : messages.isError ? (
        <ErrorState
          message={
            messages.error instanceof ApiError
              ? messages.error.message
              : 'Unable to load the conversation.'
          }
          onRetry={() => messages.refetch()}
        />
      ) : messages.data.items.length === 0 ? (
        <EmptyState
          title="No replies yet"
          description="Answer the customer, or leave an internal comment for your team."
        />
      ) : (
        <ul className="space-y-3">
          {messages.data.items.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ul>
      )}
    </div>
  );
}
