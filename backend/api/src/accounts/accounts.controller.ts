import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createAccountSchema,
  listAccountsQuerySchema,
  updateAccountSchema,
  type AuthenticatedUser,
  type CreateAccountInput,
  type ListAccountsQuery,
  type UpdateAccountInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @RequirePermissions(PERMISSIONS.ACCOUNT_READ)
  @Get()
  list(@Query(zodBody(listAccountsQuerySchema)) query: ListAccountsQuery) {
    return this.accounts.list(query);
  }

  @RequirePermissions(PERMISSIONS.ACCOUNT_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accounts.findById(id);
  }

  @RequirePermissions(PERMISSIONS.ACCOUNT_READ)
  @Get(':id/contacts')
  listContacts(@Param('id') id: string) {
    return this.accounts.listContacts(id);
  }

  @RequirePermissions(PERMISSIONS.ACCOUNT_CREATE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createAccountSchema)) dto: CreateAccountInput,
  ) {
    return this.accounts.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.ACCOUNT_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateAccountSchema)) dto: UpdateAccountInput,
  ) {
    return this.accounts.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.ACCOUNT_DELETE)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.accounts.remove(id, user);
    return { deleted: true };
  }
}
