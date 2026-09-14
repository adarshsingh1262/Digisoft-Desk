import { Module } from '@nestjs/common';
import { KbController } from './kb.controller';
import { KbCategoriesService } from './kb-categories.service';
import { KbArticlesService } from './kb-articles.service';

@Module({
  controllers: [KbController],
  providers: [KbCategoriesService, KbArticlesService],
  exports: [KbCategoriesService, KbArticlesService],
})
export class KbModule {}
