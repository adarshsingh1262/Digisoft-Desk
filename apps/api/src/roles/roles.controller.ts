import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  PERMISSIONS,
  createRoleSchema,
  updateRoleSchema,
  type AuthenticatedUser,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @Get('roles')
  list() {
    return this.roles.list();
  }

  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @Get('permissions')
  listPermissions() {
    return this.roles.listPermissions();
  }

  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @Get('roles/:id')
  findOne(@Param('id') id: string) {
    return this.roles.findById(id);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Post('roles')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createRoleSchema)) dto: CreateRoleInput,
  ) {
    return this.roles.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Patch('roles/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateRoleSchema)) dto: UpdateRoleInput,
  ) {
    return this.roles.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Delete('roles/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.roles.remove(id, user);
    return { deleted: true };
  }
}
