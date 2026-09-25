import type {
  CommunityCategoryInput,
  CreateReplyInput,
  ListTopicsQuery,
  ModerateReplyInput,
  ModerateTopicInput,
  UpdateCommunityCategoryInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type {
  CommunityCategory,
  CommunityReply,
  CommunityTopic,
  CommunityTopicDetail,
} from '@/types/api';

export const communityService = {
  categories: () => apiGet<CommunityCategory[]>('/community/categories'),
  createCategory: (input: CommunityCategoryInput) =>
    apiPost<CommunityCategory>('/community/categories', input),
  updateCategory: (id: string, input: UpdateCommunityCategoryInput) =>
    apiPatch<CommunityCategory>(`/community/categories/${id}`, input),
  removeCategory: (id: string) => apiDelete<{ deleted: true }>(`/community/categories/${id}`),

  topics: (params: Partial<ListTopicsQuery>) =>
    apiGetPaged<CommunityTopic>('/community/topics', { params }),
  topic: (id: string) => apiGet<CommunityTopicDetail>(`/community/topics/${id}`),
  moderateTopic: (id: string, input: ModerateTopicInput) =>
    apiPatch<CommunityTopic>(`/community/topics/${id}/moderate`, input),
  reply: (id: string, input: CreateReplyInput) =>
    apiPost<CommunityReply>(`/community/topics/${id}/replies`, input),
  removeTopic: (id: string) => apiDelete<{ deleted: true }>(`/community/topics/${id}`),
  moderateReply: (id: string, input: ModerateReplyInput) =>
    apiPatch<CommunityReply>(`/community/replies/${id}/moderate`, input),
  removeReply: (id: string) => apiDelete<{ deleted: true }>(`/community/replies/${id}`),
};
