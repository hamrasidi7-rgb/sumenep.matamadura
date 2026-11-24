-- CreateTable
CREATE TABLE `admin_user` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `email` VARCHAR(254) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `password_hash` VARCHAR(512) NOT NULL,
    `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_session` (
    `id` CHAR(36) NOT NULL,
    `admin_id` INTEGER NOT NULL DEFAULT 1,
    `token_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_reason` VARCHAR(191) NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(400) NULL,

    UNIQUE INDEX `admin_session_token_hash_key`(`token_hash`),
    INDEX `admin_session_admin_id_revoked_at_expires_at_idx`(`admin_id`, `revoked_at`, `expires_at`),
    INDEX `admin_session_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login_attempt` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(254) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(32) NOT NULL,
    `user_agent` VARCHAR(400) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `login_attempt_ip_created_at_idx`(`ip`, `created_at` DESC),
    INDEX `login_attempt_created_at_idx`(`created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `author` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `role` VARCHAR(200) NOT NULL DEFAULT '',
    `bio` TEXT NULL,
    `avatar_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `author_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `section` (
    `id` CHAR(36) NOT NULL,
    `kind` ENUM('KANAL', 'RUBRIK') NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `section_kind_is_active_sort_order_idx`(`kind`, `is_active`, `sort_order`),
    UNIQUE INDEX `section_kind_slug_key`(`kind`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `standfirst` TEXT NOT NULL DEFAULT '',
    `template` ENUM('STANDARD', 'FEATURE', 'SPOTLIGHT') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `body` JSON NOT NULL,
    `body_text` MEDIUMTEXT NOT NULL DEFAULT '',
    `reading_minutes` INTEGER NOT NULL DEFAULT 1,
    `author_id` CHAR(36) NOT NULL,
    `kanal_id` CHAR(36) NULL,
    `rubrik_id` CHAR(36) NULL,
    `hero_media_id` CHAR(36) NULL,
    `tags` JSON NOT NULL,
    `seo_title` VARCHAR(300) NULL,
    `seo_description` TEXT NULL,
    `canonical_url` TEXT NULL,
    `og_media_id` CHAR(36) NULL,
    `hide_from_homepage` BOOLEAN NOT NULL DEFAULT false,
    `is_demo` BOOLEAN NOT NULL DEFAULT false,
    `published_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `article_slug_key`(`slug`),
    INDEX `article_status_published_at_idx`(`status`, `published_at` DESC),
    INDEX `article_kanal_id_status_published_at_idx`(`kanal_id`, `status`, `published_at` DESC),
    INDEX `article_rubrik_id_status_published_at_idx`(`rubrik_id`, `status`, `published_at` DESC),
    INDEX `article_author_id_status_published_at_idx`(`author_id`, `status`, `published_at` DESC),
    INDEX `article_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_slug_history` (
    `slug` VARCHAR(200) NOT NULL,
    `article_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `article_slug_history_article_id_idx`(`article_id`),
    PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_revision` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `article_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `reason` ENUM('MANUAL_SAVE', 'PUBLISH', 'RESTORE') NOT NULL,
    `snapshot` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `article_revision_article_id_created_at_idx`(`article_id`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_status_change` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `article_id` CHAR(36) NOT NULL,
    `from_status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NULL,
    `to_status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `article_status_change_article_id_changed_at_idx`(`article_id`, `changed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_media` (
    `article_id` CHAR(36) NOT NULL,
    `media_id` CHAR(36) NOT NULL,
    `usage` ENUM('BODY', 'GALLERY') NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `article_media_media_id_idx`(`media_id`),
    PRIMARY KEY (`article_id`, `usage`, `media_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media` (
    `id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(128) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `sha256` CHAR(64) NOT NULL,
    `alt` VARCHAR(500) NOT NULL DEFAULT '',
    `caption` TEXT NULL,
    `credit` VARCHAR(300) NULL,
    `variants` JSON NOT NULL,
    `folder_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_storage_key_key`(`storage_key`),
    UNIQUE INDEX `media_sha256_key`(`sha256`),
    INDEX `media_folder_id_created_at_idx`(`folder_id`, `created_at` DESC),
    INDEX `media_created_at_idx`(`created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_folder` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_folder_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `homepage_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `hero_article_id` CHAR(36) NULL,
    `latest_count` INTEGER NOT NULL DEFAULT 4,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `homepage_featured` (
    `article_id` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,

    UNIQUE INDEX `homepage_featured_position_key`(`position`),
    PRIMARY KEY (`article_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `homepage_rubric` (
    `section_id` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `item_count` INTEGER NOT NULL DEFAULT 3,

    UNIQUE INDEX `homepage_rubric_position_key`(`position`),
    PRIMARY KEY (`section_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `tagline` VARCHAR(300) NULL,
    `description` TEXT NULL,
    `contact_email` VARCHAR(254) NULL,
    `social_links` JSON NOT NULL,
    `default_og_media_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actor` ENUM('ADMIN', 'CLI', 'SYSTEM') NOT NULL,
    `admin_id` INTEGER NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(64) NULL,
    `entity_id` VARCHAR(191) NULL,
    `summary` TEXT NOT NULL DEFAULT '',
    `meta` JSON NOT NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(400) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_log_created_at_idx`(`created_at` DESC),
    INDEX `activity_log_entity_type_entity_id_created_at_idx`(`entity_type`, `entity_id`, `created_at` DESC),
    INDEX `activity_log_action_created_at_idx`(`action`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_session` ADD CONSTRAINT `admin_session_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `author` ADD CONSTRAINT `author_avatar_id_fkey` FOREIGN KEY (`avatar_id`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_kanal_id_fkey` FOREIGN KEY (`kanal_id`) REFERENCES `section`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_rubrik_id_fkey` FOREIGN KEY (`rubrik_id`) REFERENCES `section`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_hero_media_id_fkey` FOREIGN KEY (`hero_media_id`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_og_media_id_fkey` FOREIGN KEY (`og_media_id`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_slug_history` ADD CONSTRAINT `article_slug_history_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_revision` ADD CONSTRAINT `article_revision_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_status_change` ADD CONSTRAINT `article_status_change_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_media` ADD CONSTRAINT `article_media_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_media` ADD CONSTRAINT `article_media_media_id_fkey` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `media_folder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `homepage_settings` ADD CONSTRAINT `homepage_settings_hero_article_id_fkey` FOREIGN KEY (`hero_article_id`) REFERENCES `article`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `homepage_featured` ADD CONSTRAINT `homepage_featured_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `homepage_rubric` ADD CONSTRAINT `homepage_rubric_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `section`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_settings` ADD CONSTRAINT `site_settings_default_og_media_id_fkey` FOREIGN KEY (`default_og_media_id`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_user`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

