import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { csatSubmitSchema, type CsatSubmitInput } from '@digisoft/shared';
import { Public } from '../common/decorators/public.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { CsatService } from './csat.service';

/**
 * The customer's side of a survey. The emailed token is the only credential — there is
 * no account to sign into — so it is single-use, expires, and is rate limited.
 */
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('csat')
export class CsatPublicController {
  constructor(private readonly csat: CsatService) {}

  @Get(':token')
  load(@Param('token') token: string) {
    return this.csat.load(token);
  }

  @Post(':token')
  submit(
    @Param('token') token: string,
    @Body(zodBody(csatSubmitSchema)) dto: CsatSubmitInput,
  ) {
    return this.csat.submit(token, dto);
  }
}
