-- Add self-hosted preview fields to VideoEmbed
ALTER TABLE `VideoEmbed` ADD COLUMN `previewM3u8Path` VARCHAR(500);
ALTER TABLE `VideoEmbed` ADD COLUMN `previewSegmentDir` VARCHAR(500);
ALTER TABLE `VideoEmbed` ADD COLUMN `previewDownloadedAt` DATETIME(3);
ALTER TABLE `VideoEmbed` ADD COLUMN `previewExpiry` DATETIME(3);
ALTER TABLE `VideoEmbed` ADD COLUMN `previewSourceUrl` LONGTEXT;
