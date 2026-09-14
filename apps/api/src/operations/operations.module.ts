import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { AssignmentRulesService } from './assignment-rules.service';
import { AutomationRulesService } from './automation-rules.service';
import { SlaPoliciesService } from './sla-policies.service';
import { BlueprintsService } from './blueprints.service';

@Module({
  controllers: [OperationsController],
  providers: [AssignmentRulesService, AutomationRulesService, SlaPoliciesService, BlueprintsService],
  exports: [AssignmentRulesService, AutomationRulesService, SlaPoliciesService, BlueprintsService],
})
export class OperationsModule {}
