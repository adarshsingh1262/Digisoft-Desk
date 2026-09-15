import { Global, Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { CsatPublicController } from './csat-public.controller';
import { AnalyticsService } from './analytics.service';
import { CsatService } from './csat.service';
import { ReportDefinitionsService } from './report-definitions.service';
import { ReportExportsService } from './report-exports.service';

/**
 * Global so the ticket lifecycle can ask for a survey when a ticket is resolved without
 * importing the module that owns the reporting endpoints.
 */
@Global()
@Module({
  controllers: [AnalyticsController, CsatPublicController],
  providers: [AnalyticsService, CsatService, ReportDefinitionsService, ReportExportsService],
  exports: [AnalyticsService, CsatService],
})
export class AnalyticsModule {}
