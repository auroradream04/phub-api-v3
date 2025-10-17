-- ============================================================================
-- CATEGORY EXTRACTION SQL QUERIES
-- Database: phub_api_v3 (MySQL)
-- Purpose: Investigate category storage for MacCMS API
-- ============================================================================

-- 1. GET ALL CATEGORIES WITH VIDEO COUNTS (PRIMARY APPROACH)
-- This is what you'll use for the MacCMS categories endpoint
-- ============================================================================
SELECT
  typeId AS type_id,
  typeName AS type_name,
  LOWER(REPLACE(typeName, ' ', '-')) AS type_en,
  COUNT(*) AS type_count
FROM Video
WHERE typeName != ''
GROUP BY typeId, typeName
ORDER BY type_count DESC;

-- Expected Result: List of 20-60 categories with video counts
-- Example:
-- type_id | type_name | type_en    | type_count
-- --------|-----------|------------|------------
-- 1       | Asian     | asian      | 1234
-- 2       | Teen      | teen       | 987
-- 3       | MILF      | milf       | 856


-- 2. SAMPLE VIDEOS - SEE HOW CATEGORIES ARE STORED
-- ============================================================================
SELECT
  vodId,
  SUBSTRING(vodName, 1, 50) AS vodName,
  typeId,
  typeName,
  vodClass
FROM Video
LIMIT 10;

-- This shows you the actual data structure:
-- - typeId: The primary category ID
-- - typeName: The primary category name
-- - vodClass: Comma-separated list of ALL categories


-- 3. CHECK FOR CUSTOM CATEGORIES (japanese, chinese)
-- ============================================================================
SELECT
  'Japanese as Primary' AS category_type,
  COUNT(*) AS video_count
FROM Video
WHERE LOWER(typeName) LIKE '%japanese%'

UNION ALL

SELECT
  'Japanese in Tags' AS category_type,
  COUNT(*) AS video_count
FROM Video
WHERE vodClass LIKE '%japanese%'

UNION ALL

SELECT
  'Chinese as Primary' AS category_type,
  COUNT(*) AS video_count
FROM Video
WHERE LOWER(typeName) LIKE '%chinese%'

UNION ALL

SELECT
  'Chinese in Tags' AS category_type,
  COUNT(*) AS video_count
FROM Video
WHERE vodClass LIKE '%chinese%';


-- 4. VERIFY TYPEID CONSISTENCY
-- Each typeId should have only ONE typeName
-- ============================================================================
SELECT
  typeId,
  GROUP_CONCAT(DISTINCT typeName) AS type_names,
  COUNT(DISTINCT typeName) AS name_count
FROM Video
GROUP BY typeId
HAVING name_count > 1;

-- Expected: 0 rows (empty result)
-- If you get rows, there's data inconsistency


-- 5. CHECK FOR NULL OR EMPTY CATEGORIES
-- ============================================================================
SELECT
  'Empty typeName' AS issue,
  COUNT(*) AS count
FROM Video
WHERE typeName IS NULL OR typeName = ''

UNION ALL

SELECT
  'Empty vodClass' AS issue,
  COUNT(*) AS count
FROM Video
WHERE vodClass IS NULL OR vodClass = '';

-- Expected:
-- - Empty typeName: 0
-- - Empty vodClass: May have some (optional field)


-- 6. GET CATEGORY STATISTICS
-- ============================================================================
SELECT
  'Total Videos' AS metric,
  COUNT(*) AS value
FROM Video

UNION ALL

SELECT
  'Total Categories' AS metric,
  COUNT(DISTINCT typeId) AS value
FROM Video

UNION ALL

SELECT
  'Avg Videos per Category' AS metric,
  ROUND(COUNT(*) / COUNT(DISTINCT typeId)) AS value
FROM Video;


-- 7. TOP 10 CATEGORIES BY VIDEO COUNT
-- ============================================================================
SELECT
  typeId,
  typeName,
  COUNT(*) AS video_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM Video), 2) AS percentage
FROM Video
WHERE typeName != ''
GROUP BY typeId, typeName
ORDER BY video_count DESC
LIMIT 10;


-- 8. BOTTOM 10 CATEGORIES (LEAST VIDEOS)
-- Helps identify rarely used categories
-- ============================================================================
SELECT
  typeId,
  typeName,
  COUNT(*) AS video_count
FROM Video
WHERE typeName != ''
GROUP BY typeId, typeName
ORDER BY video_count ASC
LIMIT 10;


-- 9. ANALYZE VODCLASS FIELD - PARSE ALL CATEGORIES
-- WARNING: This is slow on large tables (no index on vodClass)
-- ============================================================================
SELECT
  DISTINCT TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(vodClass, ',', numbers.n), ',', -1)) AS category_name
FROM Video
CROSS JOIN (
  SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
  SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
  SELECT 9 UNION ALL SELECT 10
) numbers
WHERE vodClass IS NOT NULL
  AND vodClass != ''
  AND CHAR_LENGTH(vodClass) - CHAR_LENGTH(REPLACE(vodClass, ',', '')) >= numbers.n - 1
ORDER BY category_name;

-- This extracts ALL unique categories from vodClass
-- Useful for seeing secondary categories/tags


-- 10. FIND VIDEOS WITH MULTIPLE CATEGORIES (VODCLASS)
-- ============================================================================
SELECT
  vodId,
  SUBSTRING(vodName, 1, 40) AS vodName,
  typeName AS primary_category,
  vodClass AS all_categories,
  CHAR_LENGTH(vodClass) - CHAR_LENGTH(REPLACE(vodClass, ',', '')) + 1 AS category_count
FROM Video
WHERE vodClass IS NOT NULL
  AND vodClass LIKE '%,%'
ORDER BY category_count DESC
LIMIT 10;


-- 11. CHECK FOR CATEGORY NAME VARIATIONS
-- Find similar category names that might need consolidation
-- ============================================================================
SELECT
  typeId,
  typeName,
  COUNT(*) AS video_count
FROM Video
WHERE typeName != ''
GROUP BY typeId, typeName
ORDER BY typeName, typeId;

-- Look for patterns like:
-- - "Teen" vs "Teens"
-- - "Asian" vs "asian" (case differences)


-- 12. EXPORT DATA FOR MACCMS API (FULL QUERY)
-- This is the exact query you'll use in your API endpoint
-- ============================================================================
SELECT
  JSON_OBJECT(
    'code', 1,
    'msg', '数据列表',
    'page', 1,
    'pagecount', 1,
    'limit', COUNT(*),
    'total', COUNT(*),
    'list', JSON_ARRAYAGG(
      JSON_OBJECT(
        'type_id', typeId,
        'type_name', typeName,
        'type_en', LOWER(REPLACE(typeName, ' ', '-')),
        'type_count', video_count
      )
    )
  ) AS json_response
FROM (
  SELECT
    typeId,
    typeName,
    COUNT(*) AS video_count
  FROM Video
  WHERE typeName != ''
  GROUP BY typeId, typeName
  ORDER BY video_count DESC
) AS categories;

-- This returns a single JSON object in MacCMS format


-- ============================================================================
-- QUICK REFERENCE COMMANDS
-- ============================================================================

-- Connect to database:
-- mysql -u root -p phub_api_v3

-- See table structure:
-- DESCRIBE Video;

-- Check indexes:
-- SHOW INDEX FROM Video;

-- Table stats:
-- SELECT
--   COUNT(*) as total_videos,
--   COUNT(DISTINCT typeId) as total_categories,
--   MIN(createdAt) as oldest_video,
--   MAX(createdAt) as newest_video
-- FROM Video;


-- ============================================================================
-- PERFORMANCE TIPS
-- ============================================================================

-- These queries are FAST (use index):
-- - SELECT ... WHERE typeId = X
-- - SELECT ... GROUP BY typeId
-- - SELECT ... ORDER BY typeId

-- These queries are SLOW (no index):
-- - SELECT ... WHERE vodClass LIKE '%keyword%'
-- - SELECT ... WHERE typeName LIKE '%keyword%'

-- For production API, use the primary category approach (queries 1 and 12)
-- and cache the results for 1 hour.
