import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ChannelWebhookService } from './channel-webhook.service';

/**
 * Where providers post. The path carries the channel id and its URL secret, and the
 * provider's own signature is checked on top of that before anything is stored.
 */
@Public()
@Controller('webhooks')
export class ChannelWebhooksController {
  constructor(private readonly webhooks: ChannelWebhookService) {}

  /** Meta-style subscription handshake: echo the challenge when the token matches. */
  @Get(':channelId/:secret')
  challenge(
    @Param('channelId') channelId: string,
    @Param('secret') secret: string,
    @Query() query: Record<string, string | undefined>,
  ): Promise<string> {
    return this.webhooks.challenge(channelId, secret, query);
  }

  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':channelId/:secret')
  async receive(
    @Param('channelId') channelId: string,
    @Param('secret') secret: string,
    @Req() request: Request,
  ): Promise<{ received: true; results: unknown[] }> {
    const results = await this.webhooks.receive({
      channelId,
      secret,
      rawBody: request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {}),
      payload: request.body,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value[0] : value,
        ]),
      ),
      query: request.query as Record<string, string | undefined>,
      url: `${request.protocol}://${request.get('host') ?? ''}${request.originalUrl}`,
    });
    return { received: true, results };
  }
}
