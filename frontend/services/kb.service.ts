import type {
  KbArticleInput,
  KbCategoryInput,
  ListKbArticlesQuery,
  UpdateKbArticleInput,
  UpdateKbCategoryInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { KbArticle, KbArticleFeedback, KbArticleSummary, KbCategory } from '@/types/api';

export const kbService = {
  categories: () => apiGet<KbCategory[]>('/kb/categories'),
  createCategory: (input: KbCategoryInput) => apiPost<KbCategory>('/kb/categories', input),
  updateCategory: (id: string, input: UpdateKbCategoryInput) =>
    apiPatch<KbCategory>(`/kb/categories/${id}`, input),
  removeCategory: (id: string) => apiDelete<{ deleted: true }>(`/kb/categories/${id}`),

  articles: (params: Partial<ListKbArticlesQuery>) =>
    apiGetPaged<KbArticleSummary>('/kb/articles', { params }),
  article: (id: string) => apiGet<KbArticle>(`/kb/articles/${id}`),
  createArticle: (input: KbArticleInput) => apiPost<KbArticle>('/kb/articles', input),
  updateArticle: (id: string, input: UpdateKbArticleInput) =>
    apiPatch<KbArticle>(`/kb/articles/${id}`, input),
  publish: (id: string) => apiPost<KbArticle>(`/kb/articles/${id}/publish`),
  unpublish: (id: string) => apiPost<KbArticle>(`/kb/articles/${id}/unpublish`),
  removeArticle: (id: string) => apiDelete<{ deleted: true }>(`/kb/articles/${id}`),
  feedback: (id: string) => apiGet<KbArticleFeedback[]>(`/kb/articles/${id}/feedback`),
};
