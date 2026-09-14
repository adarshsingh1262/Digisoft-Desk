import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { paginationQuerySchema, queryBoolean, type AuthenticatedUser } from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const listQuerySchema = paginationQuerySchema.extend({
  unreadOnly: queryBoolean.optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listQuerySchema)) query: ListQuery,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.countUnread(user.id) };
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markRead(id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }
}
