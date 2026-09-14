import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PERMISSIONS,
  kbArticleSchema,
  kbCategorySchema,
  listKbArticlesQuerySchema,
  updateKbArticleSchema,
  updateKbCategorySchema,
  type AuthenticatedUser,
  type KbArticleInput,
  type KbCategoryInput,
  type ListKbArticlesQuery,
  type UpdateKbArticleInput,
  type UpdateKbCategoryInput,
} from '@digisoft/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { KbCategoriesService } from './kb-categories.service';
import { KbArticlesService } from './kb-articles.service';

@Controller('kb')
export class KbController {
  constructor(
    private readonly categories: KbCategoriesService,
    private readonly articles: KbArticlesService,
  ) {}

  @RequirePermissions(PERMISSIONS.KB_READ)
  @Get('categories')
  listCategories() {
    return this.categories.list();
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Post('categories')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(kbCategorySchema)) dto: KbCategoryInput,
  ) {
    return this.categories.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateKbCategorySchema)) dto: UpdateKbCategoryInput,
  ) {
    return this.categories.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Delete('categories/:id')
  async removeCategory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.categories.remove(id, user);
    return { deleted: true };
  }

  @RequirePermissions(PERMISSIONS.KB_READ)
  @Get('articles')
  listArticles(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listKbArticlesQuerySchema)) query: ListKbArticlesQuery,
  ) {
    return this.articles.list(user, query);
  }

  @RequirePermissions(PERMISSIONS.KB_READ)
  @Get('articles/:id')
  findArticle(@Param('id') id: string) {
    return this.articles.findById(id);
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Post('articles')
  createArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(kbArticleSchema)) dto: KbArticleInput,
  ) {
    return this.articles.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Patch('articles/:id')
  updateArticle(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(updateKbArticleSchema)) dto: UpdateKbArticleInput,
  ) {
    return this.articles.update(id, user, dto);
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Post('articles/:id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.articles.setStatus(id, user, 'PUBLISHED');
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Post('articles/:id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.articles.setStatus(id, user, 'DRAFT');
  }

  @RequirePermissions(PERMISSIONS.KB_READ)
  @Get('articles/:id/feedback')
  feedback(@Param('id') id: string) {
    return this.articles.listFeedback(id);
  }

  @RequirePermissions(PERMISSIONS.KB_MANAGE)
  @Delete('articles/:id')
  async removeArticle(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.articles.remove(id, user);
    return { deleted: true };
  }
}
