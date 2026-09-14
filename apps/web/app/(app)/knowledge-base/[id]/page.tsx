'use client';

import { useParams } from 'next/navigation';
import { ArticleEditor } from '@/components/kb/article-editor';
import { PageHeader } from '@/components/layout/page-header';

export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <PageHeader title="Edit article" description="Changes go live as soon as the article is published." />
      <ArticleEditor id={params.id} />
    </>
  );
}
