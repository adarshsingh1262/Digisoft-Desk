import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createUserSchema,
  listUsersQuerySchema,
  setUserDepartmentsSchema,
  setUserRolesSchema,
  updateUserSchema,
  type AuthenticatedUser,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions(PERMISSIONS.USER_READ)
  @Get()
  list(@Query(zodBody(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @RequirePermissions(PERMISSIONS.USER_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @RequirePermissions(PERMISSIONS.USER_CREATE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createUserSchema)) dto: CreateUserInput,
  ) {
    return this.users.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.USER_CREATE)
  @HttpCode(HttpStatus.OK)
  @Post(':id/invite')
  async resendInvite(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.users.sendInvite(user.organizationId, id);
    return { invited: true };
  }

  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateUserSchema)) dto: UpdateUserInput,
  ) {
    return this.users.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Patch(':id/roles')
  setRoles(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(setUserRolesSchema)) dto: { roleIds: string[] },
  ) {
    return this.users.setRoles(id, user, dto.roleIds);
  }

  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @Patch(':id/departments')
  setDepartments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(setUserDepartmentsSchema)) dto: { departmentIds: string[] },
  ) {
    return this.users.setDepartments(id, user, dto.departmentIds);
  }

  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @HttpCode(HttpStatus.OK)
  @Post(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.setActive(id, user, true);
  }

  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @HttpCode(HttpStatus.OK)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.setActive(id, user, false);
  }

  @RequirePermissions(PERMISSIONS.USER_DELETE)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.users.remove(id, user);
    return { deleted: true };
  }
}
