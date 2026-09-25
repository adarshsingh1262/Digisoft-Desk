import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile as UploadedFileParam,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  portalCreateTicketSchema,
  portalListTicketsQuerySchema,
  portalReplySchema,
  type AuthenticatedUser,
  type PortalCreateTicketInput,
  type PortalListTicketsQuery,
  type PortalReplyInput,
} from '@digisoft/shared';
import { Public } from '../common/decorators/public.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { AppError } from '../common/errors/app-error';
import { AttachmentsService, type UploadedFile } from '../attachments/attachments.service';
import { CurrentHelpCenter, PortalAuth, PortalGuard, PortalUser } from './portal.guard';
import { PortalTicketsService } from './portal-tickets.service';
import type { PortalHelpCenter } from './portal.types';

/** "My requests". Every route needs a signed-in customer. */
@Public()
@UseGuards(PortalGuard)
@PortalAuth()
@Controller('portal/:slug/tickets')
export class PortalTicketsController {
  constructor(
    private readonly tickets: PortalTicketsService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Get()
  list(
    @PortalUser() user: AuthenticatedUser | null,
    @Query(zodBody(portalListTicketsQuerySchema)) query: PortalListTicketsQuery,
  ) {
    return this.tickets.list(user!, query);
  }

  @Get('options')
  options() {
    return this.tickets.options();
  }

  @Get(':id')
  findOne(@PortalUser() user: AuthenticatedUser | null, @Param('id') id: string) {
    return this.tickets.findById(user!, id);
  }

  @Post()
  create(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
    @Body(zodBody(portalCreateTicketSchema)) dto: PortalCreateTicketInput,
  ) {
    return this.tickets.create(helpCenter, user!, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/replies')
  reply(
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @Body(zodBody(portalReplySchema)) dto: PortalReplyInput,
  ) {
    return this.tickets.reply(user!, id, dto);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @PortalUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @UploadedFileParam() file: UploadedFile | undefined,
  ) {
    if (!file) {
      throw AppError.validation('No file was uploaded');
    }
    return this.attachments.upload(id, user!, file);
  }

  /** Same authorisation as the agent download: the ticket must be the customer's own. */
  @Get('attachments/:attachmentId/download')
  async download(
    @PortalUser() user: AuthenticatedUser | null,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { target, fileName, mimeType, fileSize } = await this.attachments.download(
      attachmentId,
      user!,
    );

    if (target.url) {
      res.redirect(302, target.url);
      return;
    }
    if (!target.stream) {
      throw AppError.notFound('attachment');
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    target.stream.pipe(res);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/close')
  close(@PortalUser() user: AuthenticatedUser | null, @Param('id') id: string) {
    return this.tickets.close(user!, id);
  }
}
