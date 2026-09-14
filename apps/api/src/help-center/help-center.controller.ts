import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  helpCenterSettingsSchema,
  updateWebFormSchema,
  webFormSchema,
  type AuthenticatedUser,
  type HelpCenterSettingsInput,
  type UpdateWebFormInput,
  type WebFormInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { HelpCenterService } from './help-center.service';
import { WebFormsService } from './web-forms.service';

@Controller()
export class HelpCenterController {
  constructor(
    private readonly helpCenter: HelpCenterService,
    private readonly forms: WebFormsService,
  ) {}

  @RequirePermissions(PERMISSIONS.PORTAL_READ)
  @Get('help-center')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.helpCenter.get(user.organizationId);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  @Patch('help-center')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(helpCenterSettingsSchema)) dto: HelpCenterSettingsInput,
  ) {
    return this.helpCenter.update(user, dto);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  @Get('help-center/slug-suggestion')
  async suggestSlug(@Query('preferred') preferred: string) {
    return { slug: await this.helpCenter.suggestSlug(preferred ?? 'help') };
  }

  @RequirePermissions(PERMISSIONS.PORTAL_READ)
  @Get('web-forms')
  listForms() {
    return this.forms.list();
  }

  @RequirePermissions(PERMISSIONS.PORTAL_READ)
  @Get('web-forms/:id')
  findForm(@Param('id') id: string) {
    return this.forms.findById(id);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  @Post('web-forms')
  createForm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(webFormSchema)) dto: WebFormInput,
  ) {
    return this.forms.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  @Patch('web-forms/:id')
  updateForm(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateWebFormSchema)) dto: UpdateWebFormInput,
  ) {
    return this.forms.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_MANAGE)
  @Delete('web-forms/:id')
  async removeForm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.forms.remove(id, user);
    return { deleted: true };
  }
}
