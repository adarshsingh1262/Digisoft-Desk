import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CHANNEL_PROVIDERS,
  CHANNEL_SECRET_FIELDS,
  PERMISSIONS,
  channelSchema,
  listChannelEventsQuerySchema,
  listChannelsQuerySchema,
  updateChannelSchema,
  type AuthenticatedUser,
  type ChannelInput,
  type ListChannelEventsQuery,
  type ListChannelsQuery,
  type UpdateChannelInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { ChannelsService } from './channels.service';
import { ChannelOutboundService } from './channel-outbound.service';

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly outbound: ChannelOutboundService,
  ) {}

  /** What the configuration screen needs to render a form for any provider. */
  @RequirePermissions(PERMISSIONS.CHANNEL_READ)
  @Get('catalogue')
  catalogue() {
    return { providers: CHANNEL_PROVIDERS, secretFields: CHANNEL_SECRET_FIELDS };
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_READ)
  @Get('events')
  events(@Query(zodBody(listChannelEventsQuerySchema)) query: ListChannelEventsQuery) {
    return this.channels.events(query);
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_READ)
  @Get()
  list(@Query(zodBody(listChannelsQuerySchema)) query: ListChannelsQuery) {
    return this.channels.list(query);
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.channels.findById(id);
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(channelSchema)) dto: ChannelInput,
  ) {
    return this.channels.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_MANAGE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateChannelSchema)) dto: UpdateChannelInput,
  ) {
    return this.channels.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_MANAGE)
  @Post(':id/rotate-webhook')
  rotate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.channels.rotateWebhookSecret(id, user);
  }

  /** Sends a message through the channel so an operator can prove it is wired up. */
  @RequirePermissions(PERMISSIONS.CHANNEL_MANAGE)
  @Post(':id/test')
  test(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { to?: string; text?: string },
  ) {
    return this.outbound.test(id, user, body.to ?? '', body.text);
  }

  @RequirePermissions(PERMISSIONS.CHANNEL_MANAGE)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.channels.remove(id, user);
    return { deleted: true };
  }
}
