-- Optional guard triggers (MariaDB). A second, database-level copy of the rules
-- that src/server/db/guards.ts already enforces for every query of the app.
-- Installed by `npm run db:migrate` (scripts/db/triggers.ts) when the host allows
-- it: with binary logging on and no SUPER privilege (typical shared hosting),
-- MariaDB refuses CREATE TRIGGER with error 1419 and the app-level guards remain
-- the enforcement. `npm run db:verify` reports which layer is active.
--
-- They only REJECT or STAMP; they never write other tables (slug and status
-- history are written by the application), so installing them or not changes
-- no behaviour of the CMS, only who enforces the rules.
--
-- Format: statements separated by a line containing only "-- ;;" so the
-- installer can send them one by one (no DELIMITER needed).

-- The Admin row can be changed (password, lockout) but never deleted.
DROP TRIGGER IF EXISTS `admin_user_no_delete`;
-- ;;
CREATE TRIGGER `admin_user_no_delete` BEFORE DELETE ON `admin_user` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'admin_user cannot be deleted (single Admin account)';
END;
-- ;;

-- A section's kind is fixed: kanal stays kanal, rubrik stays rubrik.
DROP TRIGGER IF EXISTS `section_kind_immutable`;
-- ;;
CREATE TRIGGER `section_kind_immutable` BEFORE UPDATE ON `section` FOR EACH ROW
BEGIN
  IF NOT (NEW.`kind` <=> OLD.`kind`) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'section.kind cannot change';
  END IF;
END;
-- ;;

-- article.kanal_id must point at a KANAL, article.rubrik_id at a RUBRIK.
DROP TRIGGER IF EXISTS `article_section_kinds_insert`;
-- ;;
CREATE TRIGGER `article_section_kinds_insert` BEFORE INSERT ON `article` FOR EACH ROW
BEGIN
  IF NEW.`kanal_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `section` WHERE `id` = NEW.`kanal_id` AND `kind` = 'KANAL'
  ) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'article.kanal_id must reference an existing KANAL section';
  END IF;
  IF NEW.`rubrik_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `section` WHERE `id` = NEW.`rubrik_id` AND `kind` = 'RUBRIK'
  ) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'article.rubrik_id must reference an existing RUBRIK section';
  END IF;
END;
-- ;;
DROP TRIGGER IF EXISTS `article_section_kinds_update`;
-- ;;
CREATE TRIGGER `article_section_kinds_update` BEFORE UPDATE ON `article` FOR EACH ROW
BEGIN
  IF NOT (NEW.`kanal_id` <=> OLD.`kanal_id`) AND NEW.`kanal_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `section` WHERE `id` = NEW.`kanal_id` AND `kind` = 'KANAL'
  ) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'article.kanal_id must reference an existing KANAL section';
  END IF;
  IF NOT (NEW.`rubrik_id` <=> OLD.`rubrik_id`) AND NEW.`rubrik_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `section` WHERE `id` = NEW.`rubrik_id` AND `kind` = 'RUBRIK'
  ) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'article.rubrik_id must reference an existing RUBRIK section';
  END IF;
END;
-- ;;

-- Homepage bands only feature rubrik sections.
DROP TRIGGER IF EXISTS `homepage_rubric_kind_insert`;
-- ;;
CREATE TRIGGER `homepage_rubric_kind_insert` BEFORE INSERT ON `homepage_rubric` FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM `section` WHERE `id` = NEW.`section_id` AND `kind` = 'RUBRIK') THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'homepage_rubric.section_id must reference an existing RUBRIK section';
  END IF;
END;
-- ;;
DROP TRIGGER IF EXISTS `homepage_rubric_kind_update`;
-- ;;
CREATE TRIGGER `homepage_rubric_kind_update` BEFORE UPDATE ON `homepage_rubric` FOR EACH ROW
BEGIN
  IF NOT (NEW.`section_id` <=> OLD.`section_id`) AND NOT EXISTS (
    SELECT 1 FROM `section` WHERE `id` = NEW.`section_id` AND `kind` = 'RUBRIK'
  ) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'homepage_rubric.section_id must reference an existing RUBRIK section';
  END IF;
END;
-- ;;

-- The singleton rows can be changed but never removed.
DROP TRIGGER IF EXISTS `homepage_settings_no_delete`;
-- ;;
CREATE TRIGGER `homepage_settings_no_delete` BEFORE DELETE ON `homepage_settings` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'homepage_settings is a singleton and cannot be deleted';
END;
-- ;;
DROP TRIGGER IF EXISTS `site_settings_no_delete`;
-- ;;
CREATE TRIGGER `site_settings_no_delete` BEFORE DELETE ON `site_settings` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'site_settings is a singleton and cannot be deleted';
END;
-- ;;

-- Activity Log: any UPDATE or DELETE fails, whoever runs it. (TRUNCATE fires
-- no trigger; it needs DROP, which a separate runtime user does not have.)
DROP TRIGGER IF EXISTS `activity_log_append_only_update`;
-- ;;
CREATE TRIGGER `activity_log_append_only_update` BEFORE UPDATE ON `activity_log` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'activity_log is append-only: UPDATE is not allowed';
END;
-- ;;
DROP TRIGGER IF EXISTS `activity_log_append_only_delete`;
-- ;;
CREATE TRIGGER `activity_log_append_only_delete` BEFORE DELETE ON `activity_log` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'activity_log is append-only: DELETE is not allowed';
END;
-- ;;

-- The time of an entry is always the database's, never the client's.
DROP TRIGGER IF EXISTS `activity_log_stamp`;
-- ;;
CREATE TRIGGER `activity_log_stamp` BEFORE INSERT ON `activity_log` FOR EACH ROW
BEGIN
  SET NEW.`created_at` = CURRENT_TIMESTAMP(3);
END;
