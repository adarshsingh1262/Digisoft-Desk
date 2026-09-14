import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
  type AuthenticatedUser,
  type CreateContactInput,
  type ListContactsQuery,
  type UpdateContactInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @RequirePermissions(PERMISSIONS.CONTACT_READ)
  @Get()
  list(@Query(zodBody(listContactsQuerySchema)) query: ListContactsQuery) {
    return this.contacts.list(query);
  }

  @RequirePermissions(PERMISSIONS.CONTACT_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contacts.findById(id);
  }

  @RequirePermissions(PERMISSIONS.CONTACT_CREATE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createContactSchema)) dto: CreateContactInput,
  ) {
    return this.contacts.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.CONTACT_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateContactSchema)) dto: UpdateContactInput,
  ) {
    return this.contacts.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.CONTACT_DELETE)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.contacts.remove(id, user);
    return { deleted: true };
  }
}
