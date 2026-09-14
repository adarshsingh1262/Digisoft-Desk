import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createActivitySchema,
  listActivitiesQuerySchema,
  updateActivitySchema,
  type AuthenticatedUser,
  type CreateActivityInput,
  type ListActivitiesQuery,
  type UpdateActivityInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { ActivitiesService } from './activities.service';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @RequirePermissions(PERMISSIONS.ACTIVITY_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(zodBody(listActivitiesQuerySchema)) query: ListActivitiesQuery) {
    return this.activities.list(user, query);
  }

  @RequirePermissions(PERMISSIONS.ACTIVITY_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activities.findById(id);
  }

  @RequirePermissions(PERMISSIONS.ACTIVITY_CREATE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(zodBody(createActivitySchema)) dto: CreateActivityInput) {
    return this.activities.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.ACTIVITY_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateActivitySchema)) dto: UpdateActivityInput,
  ) {
    return this.activities.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.ACTIVITY_DELETE)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.activities.remove(id, user);
    return { deleted: true };
  }
}
