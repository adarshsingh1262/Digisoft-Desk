import { Module } from '@nestjs/common';
import { HelpCenterController } from './help-center.controller';
import { HelpCenterService } from './help-center.service';
import { WebFormsService } from './web-forms.service';

@Module({
  controllers: [HelpCenterController],
  providers: [HelpCenterService, WebFormsService],
  exports: [HelpCenterService, WebFormsService],
})
export class HelpCenterModule {}
