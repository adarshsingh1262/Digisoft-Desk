import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ANTHROPIC_MODEL_OPTIONS,
  AI_PROVIDERS,
  PERMISSIONS,
  aiSettingsSchema,
  generateInsightSchema,
  type AiSettingsInput,
  type AuthenticatedUser,
  type GenerateInsightInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { TicketsService } from '../tickets/tickets.service';
import { AiSettingsService } from './ai-settings.service';
import { AiService } from './ai.service';

@Controller()
export class AiController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly ai: AiService,
    private readonly tickets: TicketsService,
  ) {}

  @RequirePermissions(PERMISSIONS.AI_USE)
  @Get('ai/settings')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.organizationId);
  }

  @RequirePermissions(PERMISSIONS.AI_MANAGE)
  @Patch('ai/settings')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(aiSettingsSchema)) dto: AiSettingsInput,
  ) {
    return this.settings.update(user, dto);
  }

  @RequirePermissions(PERMISSIONS.AI_USE)
  @Get('ai/catalogue')
  catalogue() {
    return { providers: AI_PROVIDERS, models: ANTHROPIC_MODEL_OPTIONS };
  }

  @RequirePermissions(PERMISSIONS.AI_MANAGE)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('ai/test')
  test(@CurrentUser() user: AuthenticatedUser) {
    return this.ai.test(user);
  }

  @RequirePermissions(PERMISSIONS.AI_USE)
  @Get('ai/usage')
  usage(@CurrentUser() user: AuthenticatedUser) {
    return this.ai.usage(user.organizationId);
  }

  /** Everything the assistant has said about this ticket, newest of each kind. */
  @RequirePermissions(PERMISSIONS.AI_USE)
  @Get('tickets/:id/ai')
  forTicket(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tickets.assertVisible(user, id).then(() => this.ai.forTicket(id));
  }

  @RequirePermissions(PERMISSIONS.AI_USE)
  @Get('tickets/:id/ai/articles')
  async articles(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.tickets.assertVisible(user, id);
    return this.ai.suggestArticles(user.organizationId, id);
  }

  @RequirePermissions(PERMISSIONS.AI_USE)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('tickets/:id/ai')
  async generate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(generateInsightSchema)) dto: GenerateInsightInput,
  ) {
    await this.tickets.assertVisible(user, id);
    return this.ai.generate(user.organizationId, id, dto.type, {
      actorId: user.id,
      refresh: dto.refresh,
    });
  }
}
