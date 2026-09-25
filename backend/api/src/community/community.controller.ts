import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  communityCategorySchema,
  createReplySchema,
  listTopicsQuerySchema,
  moderateReplySchema,
  moderateTopicSchema,
  updateCommunityCategorySchema,
  type AuthenticatedUser,
  type CommunityCategoryInput,
  type CreateReplyInput,
  type ListTopicsQuery,
  type ModerateReplyInput,
  type ModerateTopicInput,
  type UpdateCommunityCategoryInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { CommunityService } from './community.service';

/** Agent-side moderation. The customer-facing routes live under /portal/:slug. */
@Controller('community')
@RequirePermissions(PERMISSIONS.COMMUNITY_MODERATE)
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.community.listCategories(this.community.viewerFor(user));
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(communityCategorySchema)) dto: CommunityCategoryInput,
  ) {
    return this.community.createCategory(user, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateCommunityCategorySchema)) dto: UpdateCommunityCategoryInput,
  ) {
    return this.community.updateCategory(id, user, dto);
  }

  @Delete('categories/:id')
  async removeCategory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.community.removeCategory(id, user);
    return { deleted: true };
  }

  @Get('topics')
  listTopics(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listTopicsQuerySchema)) query: ListTopicsQuery,
  ) {
    return this.community.listTopics(this.community.viewerFor(user), query);
  }

  @Get('topics/:id')
  findTopic(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.community.findTopic(this.community.viewerFor(user), id);
  }

  @Patch('topics/:id/moderate')
  moderateTopic(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(moderateTopicSchema)) dto: ModerateTopicInput,
  ) {
    return this.community.moderateTopic(id, user, dto);
  }

  @Post('topics/:id/replies')
  reply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createReplySchema)) dto: CreateReplyInput,
  ) {
    return this.community.createReply(id, user, dto, { moderate: false });
  }

  @Delete('topics/:id')
  async removeTopic(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.community.removeTopic(id, user);
    return { deleted: true };
  }

  @Patch('replies/:id/moderate')
  moderateReply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(moderateReplySchema)) dto: ModerateReplyInput,
  ) {
    return this.community.moderateReply(id, user, dto);
  }

  @Delete('replies/:id')
  async removeReply(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.community.removeReply(id, user);
    return { deleted: true };
  }
}
