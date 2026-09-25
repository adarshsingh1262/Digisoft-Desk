import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  PERMISSIONS,
  createDepartmentSchema,
  createTeamSchema,
  updateDepartmentSchema,
  updateTeamSchema,
  type AuthenticatedUser,
  type CreateDepartmentInput,
  type CreateTeamInput,
  type UpdateDepartmentInput,
  type UpdateTeamInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { DepartmentsService } from './departments.service';

@Controller()
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @RequirePermissions(PERMISSIONS.DEPARTMENT_READ)
  @Get('departments')
  list() {
    return this.departments.list();
  }

  @RequirePermissions(PERMISSIONS.DEPARTMENT_READ)
  @Get('departments/:id')
  findOne(@Param('id') id: string) {
    return this.departments.findById(id);
  }

  @RequirePermissions(PERMISSIONS.DEPARTMENT_MANAGE)
  @Post('departments')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createDepartmentSchema)) dto: CreateDepartmentInput,
  ) {
    return this.departments.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.DEPARTMENT_MANAGE)
  @Patch('departments/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateDepartmentSchema)) dto: UpdateDepartmentInput,
  ) {
    return this.departments.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.DEPARTMENT_MANAGE)
  @Delete('departments/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.departments.remove(id, user);
    return { deleted: true };
  }

  @RequirePermissions(PERMISSIONS.TEAM_READ)
  @Get('teams')
  listTeams() {
    return this.departments.listTeams();
  }

  @RequirePermissions(PERMISSIONS.TEAM_READ)
  @Get('teams/:id')
  findTeam(@Param('id') id: string) {
    return this.departments.findTeamById(id);
  }

  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  @Post('teams')
  createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createTeamSchema)) dto: CreateTeamInput,
  ) {
    return this.departments.createTeam(user, dto);
  }

  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  @Patch('teams/:id')
  updateTeam(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateTeamSchema)) dto: UpdateTeamInput,
  ) {
    return this.departments.updateTeam(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  @Delete('teams/:id')
  async removeTeam(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.departments.removeTeam(id, user);
    return { deleted: true };
  }
}
