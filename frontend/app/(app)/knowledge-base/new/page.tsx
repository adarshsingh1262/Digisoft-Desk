'use client';

import { ArticleEditor } from '@/components/kb/article-editor';
import { PageHeader } from '@/components/layout/page-header';

export default function NewArticlePage() {
  return (
    <>
      <PageHeader title="New article" description="Write it in Markdown; publish when it reads well." />
      <ArticleEditor id={null} />
    </>
  );
}
