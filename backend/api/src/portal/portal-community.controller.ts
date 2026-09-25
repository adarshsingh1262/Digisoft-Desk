import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createReplySchema,
  createTopicSchema,
  listTopicsQuerySchema,
  updateTopicSchema,
  type AuthenticatedUser,
  type CreateReplyInput,
  type CreateTopicInput,
  type ListTopicsQuery,
  type UpdateTopicInput,
} from '@digisoft/shared';
import { Public } from '../common/decorators/public.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { AppError } from '../common/errors/app-error';
import { CommunityService } from '../community/community.service';
import { CurrentHelpCenter, PortalAuth, PortalGuard, PortalUser } from './portal.guard';
import type { PortalHelpCenter } from './portal.types';

/** The customer-facing community. Agents moderate the same content under /community. */
@Public()
@UseGuards(PortalGuard)
@Controller('portal/:slug/community')
export class PortalCommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('categories')
  categories(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.listCategories(this.community.viewerFor(user));
  }

  @Get('topics')
  topics(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Query(zodBody(listTopicsQuerySchema)) query: ListTopicsQuery,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.listTopics(this.community.viewerFor(user), query);
  }

  @Get('topics/:idOrSlug')
  topic(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.findTopic(this.community.viewerFor(user), idOrSlug, true);
  }

  @PortalAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('topics')
  createTopic(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Body(zodBody(createTopicSchema)) dto: CreateTopicInput,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.createTopic(user!, dto, { moderate: helpCenter.moderateCommunity });
  }

  @PortalAuth()
  @Patch('topics/:id')
  updateTopic(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @Body(zodBody(updateTopicSchema)) dto: UpdateTopicInput,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.updateTopic(id, user!, dto);
  }

  @PortalAuth()
  @Delete('topics/:id')
  async removeTopic(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.assertEnabled(helpCenter);
    await this.community.removeTopic(id, user!);
    return { deleted: true };
  }

  @PortalAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('topics/:id/replies')
  reply(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @Body(zodBody(createReplySchema)) dto: CreateReplyInput,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.createReply(id, user!, dto, { moderate: helpCenter.moderateCommunity });
  }

  @PortalAuth()
  @HttpCode(HttpStatus.OK)
  @Post('topics/:id/vote')
  voteTopic(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.toggleVote(user!, { topicId: id });
  }

  @PortalAuth()
  @HttpCode(HttpStatus.OK)
  @Post('replies/:id/vote')
  voteReply(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.toggleVote(user!, { replyId: id });
  }

  @PortalAuth()
  @HttpCode(HttpStatus.OK)
  @Post('replies/:id/accept')
  acceptAnswer(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.assertEnabled(helpCenter);
    return this.community.acceptAnswer(id, user!);
  }

  @PortalAuth()
  @Delete('replies/:id')
  async removeReply(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.assertEnabled(helpCenter);
    await this.community.removeReply(id, user!);
    return { deleted: true };
  }

  private assertEnabled(helpCenter: PortalHelpCenter): void {
    if (!helpCenter.communityEnabled) {
      throw AppError.notFound('community');
    }
  }
}
