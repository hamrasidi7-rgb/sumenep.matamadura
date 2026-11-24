-- CreateEnum
CREATE TYPE "section_kind" AS ENUM ('KANAL', 'RUBRIK');

-- CreateEnum
CREATE TYPE "article_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "article_template" AS ENUM ('STANDARD', 'FEATURE', 'SPOTLIGHT');

-- CreateEnum
CREATE TYPE "revision_reason" AS ENUM ('MANUAL_SAVE', 'PUBLISH', 'RESTORE');

-- CreateEnum
CREATE TYPE "article_media_usage" AS ENUM ('BODY', 'GALLERY');

-- CreateEnum
CREATE TYPE "activity_actor" AS ENUM ('ADMIN', 'CLI', 'SYSTEM');

-- CreateTable
CREATE TABLE "admin_user" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" INTEGER NOT NULL DEFAULT 1,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "bio" TEXT,
    "avatar_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "section_kind" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "standfirst" TEXT NOT NULL DEFAULT '',
    "template" "article_template" NOT NULL DEFAULT 'STANDARD',
    "status" "article_status" NOT NULL DEFAULT 'DRAFT',
    "body" JSONB NOT NULL DEFAULT '{}',
    "body_text" TEXT NOT NULL DEFAULT '',
    "reading_minutes" INTEGER NOT NULL DEFAULT 1,
    "author_id" UUID NOT NULL,
    "kanal_id" UUID,
    "rubrik_id" UUID,
    "hero_media_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seo_title" TEXT,
    "seo_description" TEXT,
    "canonical_url" TEXT,
    "og_media_id" UUID,
    "hide_from_homepage" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_slug_history" (
    "slug" TEXT NOT NULL,
    "article_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_slug_history_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "article_revision" (
    "id" BIGSERIAL NOT NULL,
    "article_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" "revision_reason" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_status_change" (
    "id" BIGSERIAL NOT NULL,
    "article_id" UUID NOT NULL,
    "from_status" "article_status",
    "to_status" "article_status" NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_status_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_media" (
    "article_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "usage" "article_media_usage" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "article_media_pkey" PRIMARY KEY ("article_id","usage","media_id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "caption" TEXT,
    "credit" TEXT,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "folder_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_folder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hero_article_id" UUID,
    "latest_count" INTEGER NOT NULL DEFAULT 4,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "homepage_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_featured" (
    "article_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "homepage_featured_pkey" PRIMARY KEY ("article_id")
);

-- CreateTable
CREATE TABLE "homepage_rubric" (
    "section_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "homepage_rubric_pkey" PRIMARY KEY ("section_id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tagline" TEXT,
    "description" TEXT,
    "contact_email" TEXT,
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "default_og_media_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" BIGSERIAL NOT NULL,
    "actor" "activity_actor" NOT NULL,
    "admin_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_token_hash_key" ON "admin_session"("token_hash");

-- CreateIndex
CREATE INDEX "admin_session_admin_id_revoked_at_expires_at_idx" ON "admin_session"("admin_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "admin_session_expires_at_idx" ON "admin_session"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempt_ip_created_at_idx" ON "login_attempt"("ip", "created_at" DESC);

-- CreateIndex
CREATE INDEX "login_attempt_created_at_idx" ON "login_attempt"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "author_slug_key" ON "author"("slug");

-- CreateIndex
CREATE INDEX "section_kind_is_active_sort_order_idx" ON "section"("kind", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "section_kind_slug_key" ON "section"("kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "article_slug_key" ON "article"("slug");

-- CreateIndex
CREATE INDEX "article_status_published_at_idx" ON "article"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "article_kanal_id_status_published_at_idx" ON "article"("kanal_id", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "article_rubrik_id_status_published_at_idx" ON "article"("rubrik_id", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "article_author_id_status_published_at_idx" ON "article"("author_id", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "article_deleted_at_idx" ON "article"("deleted_at");

-- CreateIndex
CREATE INDEX "article_tags_idx" ON "article" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "article_slug_history_article_id_idx" ON "article_slug_history"("article_id");

-- CreateIndex
CREATE INDEX "article_revision_article_id_created_at_idx" ON "article_revision"("article_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "article_status_change_article_id_changed_at_idx" ON "article_status_change"("article_id", "changed_at");

-- CreateIndex
CREATE INDEX "article_media_media_id_idx" ON "article_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_sha256_key" ON "media"("sha256");

-- CreateIndex
CREATE INDEX "media_folder_id_created_at_idx" ON "media"("folder_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_created_at_idx" ON "media"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "media_folder_name_key" ON "media_folder"("name");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_featured_position_key" ON "homepage_featured"("position");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_rubric_position_key" ON "homepage_rubric"("position");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_created_at_idx" ON "activity_log"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_action_created_at_idx" ON "activity_log"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author" ADD CONSTRAINT "author_avatar_id_fkey" FOREIGN KEY ("avatar_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_kanal_id_fkey" FOREIGN KEY ("kanal_id") REFERENCES "section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_rubrik_id_fkey" FOREIGN KEY ("rubrik_id") REFERENCES "section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_hero_media_id_fkey" FOREIGN KEY ("hero_media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_og_media_id_fkey" FOREIGN KEY ("og_media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_slug_history" ADD CONSTRAINT "article_slug_history_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_revision" ADD CONSTRAINT "article_revision_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_status_change" ADD CONSTRAINT "article_status_change_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_media" ADD CONSTRAINT "article_media_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_media" ADD CONSTRAINT "article_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "media_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_settings" ADD CONSTRAINT "homepage_settings_hero_article_id_fkey" FOREIGN KEY ("hero_article_id") REFERENCES "article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_featured" ADD CONSTRAINT "homepage_featured_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_rubric" ADD CONSTRAINT "homepage_rubric_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_default_og_media_id_fkey" FOREIGN KEY ("default_og_media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
