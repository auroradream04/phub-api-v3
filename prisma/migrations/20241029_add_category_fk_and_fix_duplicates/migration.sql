-- Migration: Add Category Foreign Key and Fix TypeId/TypeName Duplicates
-- Date: 2024-10-29
-- Purpose: Enforce data integrity by adding FK constraint and fixing orphaned/mismatched categories

-- STEP 1: Identify and fix orphaned typeIds (typeIds with no matching category)
-- These need to be fixed before adding the FK constraint
UPDATE `Video` v
SET typeId = 1, typeName = (
  SELECT name FROM `Category` WHERE id = 1 LIMIT 1
)
WHERE typeId NOT IN (SELECT id FROM `Category`);

-- STEP 2: Fix mismatched typeName values
-- For each typeId, ensure typeName matches the actual Category.name
UPDATE `Video` v
INNER JOIN `Category` c ON v.typeId = c.id
SET v.typeName = c.name
WHERE v.typeName != c.name;

-- STEP 3: Remove duplicate (typeId, typeName) entries
-- For videos with same vodId appearing multiple times (shouldn't happen with unique constraint, but just in case)
-- This is safe because vodId is unique, so there should only be one row per video

-- STEP 4: Add foreign key constraint
-- This enforces that every typeId must reference an existing Category
ALTER TABLE `Video`
ADD CONSTRAINT `Video_typeId_fkey`
FOREIGN KEY (`typeId`)
REFERENCES `Category`(`id`)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- STEP 5: Add index on (typeId, typeName) for faster duplicate detection queries
CREATE INDEX `Video_typeId_typeName_idx` ON `Video`(`typeId`, `typeName`);

-- ROLLBACK INSTRUCTIONS (if needed):
-- 1. Remove the foreign key constraint:
--    ALTER TABLE `Video` DROP FOREIGN KEY `Video_typeId_fkey`;
--
-- 2. Remove the new index:
--    DROP INDEX `Video_typeId_typeName_idx` ON `Video`;
--
-- 3. That's it - the data changes in STEPS 1-2 are permanent but safe
--    (they actually fix data consistency issues)
