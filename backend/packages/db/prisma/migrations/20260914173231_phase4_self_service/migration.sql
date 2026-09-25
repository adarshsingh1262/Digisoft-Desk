-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'PORTAL_USERS', 'AGENTS_ONLY');

-- CreateEnum
CREATE TYPE "TopicType" AS ENUM ('QUESTION', 'DISCUSSION', 'IDEA', 'PROBLEM', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "help_centers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "welcomeMessage" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "supportEmail" TEXT,
    "footerText" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "allowPublicBrowsing" BOOLEAN NOT NULL DEFAULT true,
    "allowSelfRegistration" BOOLEAN NOT NULL DEFAULT true,
    "allowTicketSubmission" BOOLEAN NOT NULL DEFAULT true,
    "kbEnabled" BOOLEAN NOT NULL DEFAULT true,
    "communityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "moderateCommunity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kb_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_articles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "authorId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_article_feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT,
    "isHelpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_article_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_forms" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT,
    "categoryId" TEXT,
    "priorityId" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "submitLabel" TEXT NOT NULL DEFAULT 'Submit request',
    "successMessage" TEXT NOT NULL DEFAULT 'Thanks — we have received your request.',
    "requireLogin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "web_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "community_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_topics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "TopicType" NOT NULL DEFAULT 'QUESTION',
    "status" "TopicStatus" NOT NULL DEFAULT 'OPEN',
    "moderation" "ModerationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "ticketId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "community_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_replies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "moderation" "ModerationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isAnswer" BOOLEAN NOT NULL DEFAULT false,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "community_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_votes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "topicId" TEXT,
    "replyId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "help_centers_organizationId_key" ON "help_centers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "help_centers_slug_key" ON "help_centers"("slug");

-- CreateIndex
CREATE INDEX "kb_categories_organizationId_parentId_position_idx" ON "kb_categories"("organizationId", "parentId", "position");

-- CreateIndex
CREATE INDEX "kb_categories_organizationId_deletedAt_idx" ON "kb_categories"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "kb_categories_organizationId_slug_key" ON "kb_categories"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "kb_articles_organizationId_status_visibility_idx" ON "kb_articles"("organizationId", "status", "visibility");

-- CreateIndex
CREATE INDEX "kb_articles_organizationId_categoryId_position_idx" ON "kb_articles"("organizationId", "categoryId", "position");

-- CreateIndex
CREATE INDEX "kb_articles_organizationId_deletedAt_idx" ON "kb_articles"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "kb_articles_organizationId_slug_key" ON "kb_articles"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "kb_article_feedback_organizationId_articleId_idx" ON "kb_article_feedback"("organizationId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "kb_article_feedback_articleId_userId_key" ON "kb_article_feedback"("articleId", "userId");

-- CreateIndex
CREATE INDEX "web_forms_organizationId_isActive_idx" ON "web_forms"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "web_forms_organizationId_deletedAt_idx" ON "web_forms"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "web_forms_organizationId_slug_key" ON "web_forms"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "community_categories_organizationId_position_idx" ON "community_categories"("organizationId", "position");

-- CreateIndex
CREATE INDEX "community_categories_organizationId_deletedAt_idx" ON "community_categories"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_categories_organizationId_slug_key" ON "community_categories"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "community_topics_organizationId_categoryId_lastActivityAt_idx" ON "community_topics"("organizationId", "categoryId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "community_topics_organizationId_moderation_idx" ON "community_topics"("organizationId", "moderation");

-- CreateIndex
CREATE INDEX "community_topics_organizationId_deletedAt_idx" ON "community_topics"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_topics_organizationId_slug_key" ON "community_topics"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "community_replies_organizationId_topicId_createdAt_idx" ON "community_replies"("organizationId", "topicId", "createdAt");

-- CreateIndex
CREATE INDEX "community_replies_organizationId_moderation_idx" ON "community_replies"("organizationId", "moderation");

-- CreateIndex
CREATE INDEX "community_replies_organizationId_deletedAt_idx" ON "community_replies"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "community_votes_organizationId_userId_idx" ON "community_votes"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_topicId_userId_key" ON "community_votes"("topicId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_votes_replyId_userId_key" ON "community_votes"("replyId", "userId");

-- AddForeignKey
ALTER TABLE "help_centers" ADD CONSTRAINT "help_centers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "kb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "kb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_article_feedback" ADD CONSTRAINT "kb_article_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_article_feedback" ADD CONSTRAINT "kb_article_feedback_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "kb_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_article_feedback" ADD CONSTRAINT "kb_article_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_forms" ADD CONSTRAINT "web_forms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_forms" ADD CONSTRAINT "web_forms_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_forms" ADD CONSTRAINT "web_forms_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_forms" ADD CONSTRAINT "web_forms_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "ticket_priorities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_categories" ADD CONSTRAINT "community_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_topics" ADD CONSTRAINT "community_topics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_topics" ADD CONSTRAINT "community_topics_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "community_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_topics" ADD CONSTRAINT "community_topics_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_topics" ADD CONSTRAINT "community_topics_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "community_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "community_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
