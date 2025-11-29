-- Add vodPicOriginal field to Video table
-- This stores the original remote URL when thumbnails are migrated locally
ALTER TABLE `Video` ADD COLUMN `vodPicOriginal` TEXT;
