# Category Investigation Findings

## Executive Summary

Based on schema analysis of `/Users/aurora/Developer/Work/phub-api-v3/prisma/schema.prisma`, here's how categories are stored and how to extract them for the MacCMS API.

## Database Schema

### Video Table - Category Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `typeId` | Int | Primary category ID | `1`, `2`, `3` |
| `typeName` | String(100) | Primary category name | `"Asian"`, `"Teen"`, `"MILF"` |
| `vodClass` | String(500) | Comma-separated all categories | `"Asian,Babe,Teen"` |

**Indexes:**
- `typeId` is indexed (fast lookups)
- `vodClass` is NOT indexed

## Data Structure

### Primary Category System
- Each video has exactly ONE primary category
- Stored in `typeId` + `typeName`
- Fast queries due to index on `typeId`
- Used for main navigation/filtering

### Secondary Categories (Tags)
- Multiple categories per video
- Stored as comma-separated string in `vodClass`
- Includes the primary category plus additional tags
- Example: If primary is "Asian", vodClass might be "Asian,Teen,Amateur,HD"

## Recommended Extraction Method

### Best Approach: Use Primary Categories

**Why?**
1. Fast query (uses index)
2. Consistent category IDs
3. Clean one-to-one mapping
4. Perfect for MacCMS format
5. No parsing required

**Query:**
```typescript
const categories = await prisma.video.groupBy({
  by: ['typeId', 'typeName'],
  _count: { id: true },
  where: {
    typeName: { not: '' }
  },
  orderBy: {
    _count: { id: 'desc' }
  }
});
```

**Result:**
```typescript
[
  { typeId: 1, typeName: "Asian", _count: { id: 1234 } },
  { typeId: 2, typeName: "Teen", _count: { id: 987 } },
  { typeId: 3, typeName: "MILF", _count: { id: 856 } },
  // ... more categories
]
```

## MacCMS API Format

Transform the query result to MacCMS format:

```typescript
const list = categories.map(cat => ({
  type_id: cat.typeId,           // Integer ID
  type_name: cat.typeName,       // Display name
  type_en: cat.typeName.toLowerCase().replace(/\s+/g, '-'), // URL slug
  type_count: cat._count.id      // Number of videos
}));
```

**Example Output:**
```json
{
  "code": 1,
  "msg": "数据列表",
  "page": 1,
  "pagecount": 1,
  "limit": "50",
  "total": 50,
  "list": [
    {
      "type_id": 1,
      "type_name": "Asian",
      "type_en": "asian",
      "type_count": 1234
    },
    {
      "type_id": 2,
      "type_name": "Teen",
      "type_en": "teen",
      "type_count": 987
    }
  ]
}
```

## Alternative Approach: Parse vodClass

If you need ALL categories (including secondary tags):

```typescript
// 1. Fetch all vodClass values
const videos = await prisma.video.findMany({
  select: { vodClass: true },
  where: { vodClass: { not: null } }
});

// 2. Parse and count
const categoryMap = new Map();
videos.forEach(video => {
  if (video.vodClass) {
    video.vodClass.split(',').forEach(cat => {
      const trimmed = cat.trim();
      if (trimmed) {
        categoryMap.set(trimmed, (categoryMap.get(trimmed) || 0) + 1);
      }
    });
  }
});

// 3. Convert to array
const allCategories = Array.from(categoryMap.entries())
  .map(([name, count], index) => ({
    type_id: index + 1,  // Generated ID (not consistent!)
    type_name: name,
    type_en: name.toLowerCase().replace(/\s+/g, '-'),
    type_count: count
  }))
  .sort((a, b) => b.type_count - a.type_count);
```

**Warning:** This approach:
- Slower (no index)
- Generates IDs on-the-fly (inconsistent across calls)
- More categories (100+)
- Better for tag cloud, not main navigation

## Custom Categories Check

Your custom categories (japanese, chinese) could be in either:
1. As primary categories (typeId/typeName)
2. As tags in vodClass

**Verification Query:**
```typescript
// Check primary categories
const japaneseAsPrimary = await prisma.video.count({
  where: { typeName: { equals: 'japanese', mode: 'insensitive' } }
});

// Check in tags
const japaneseInTags = await prisma.video.count({
  where: { vodClass: { contains: 'japanese' } }
});

console.log(`Japanese as primary: ${japaneseAsPrimary}`);
console.log(`Japanese in tags: ${japaneseInTags}`);
```

## Data Quality Checks

Before implementing the endpoint, verify:

### 1. TypeID Consistency
Each typeId should have only one typeName:
```sql
SELECT typeId, COUNT(DISTINCT typeName) as name_count
FROM Video
GROUP BY typeId
HAVING name_count > 1;
```
Expected: 0 rows (no inconsistencies)

### 2. Null/Empty Check
```typescript
const emptyCategories = await prisma.video.count({
  where: {
    OR: [
      { typeName: null },
      { typeName: '' }
    ]
  }
});
```
Expected: 0 (all videos should have categories)

### 3. Total Category Count
```typescript
const totalCategories = await prisma.video.groupBy({
  by: ['typeId']
});
console.log(`Total categories: ${totalCategories.length}`);
```
Expected: 20-60 categories (typical for adult content site)

## Performance Notes

### Query Speed
- Primary category query: **Fast** (~50-100ms) ✅
  - Uses index on typeId
  - Simple groupBy aggregation

- vodClass parsing: **Slow** (~1-5 seconds) ❌
  - Full table scan
  - String parsing for each video
  - More memory intensive

### Caching Recommendation
```typescript
// Cache for 1 hour (categories don't change often)
const CACHE_TTL = 3600; // seconds

// Regenerate when:
// 1. New videos are scraped
// 2. Videos are deleted
// 3. Manual cache invalidation
```

## SQL Queries for Direct Database Access

If you want to check the database directly:

```sql
-- Get all categories with counts
SELECT
  typeId,
  typeName,
  COUNT(*) as video_count
FROM Video
WHERE typeName != ''
GROUP BY typeId, typeName
ORDER BY video_count DESC;

-- Sample videos with categories
SELECT
  vodId,
  vodName,
  typeId,
  typeName,
  vodClass
FROM Video
LIMIT 10;

-- Check for custom categories
SELECT COUNT(*)
FROM Video
WHERE typeName LIKE '%japanese%'
   OR typeName LIKE '%chinese%';

-- Get distinct category IDs
SELECT DISTINCT typeId, typeName
FROM Video
ORDER BY typeId;
```

## Recommended Implementation Steps

1. **Test Query First**
   - Run `npx tsx scripts/analyze-categories.ts`
   - Verify data structure
   - Check for inconsistencies

2. **Implement Endpoint**
   - Create `/api/maccms/categories/route.ts`
   - Use primary categories (typeId/typeName)
   - Add proper error handling

3. **Add Caching**
   - Cache in memory or Redis
   - Invalidate on video updates
   - TTL: 1 hour

4. **Test with MacCMS Client**
   - Verify format compatibility
   - Check encoding (UTF-8)
   - Test pagination (if needed)

5. **Monitor Performance**
   - Log query times
   - Watch for slow queries
   - Add alerts for failures

## Sample Endpoint Implementation

```typescript
// /api/maccms/categories/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// In-memory cache
let cachedCategories: any = null;
let cacheTime: number = 0;
const CACHE_TTL = 3600000; // 1 hour in ms

export async function GET(request: NextRequest) {
  try {
    // Check cache
    const now = Date.now();
    if (cachedCategories && (now - cacheTime) < CACHE_TTL) {
      return Response.json(cachedCategories);
    }

    // Query database
    const categories = await prisma.video.groupBy({
      by: ['typeId', 'typeName'],
      _count: { id: true },
      where: {
        typeName: { not: '' }
      },
      orderBy: {
        _count: { id: 'desc' }
      }
    });

    // Transform to MacCMS format
    const list = categories.map(cat => ({
      type_id: cat.typeId,
      type_name: cat.typeName,
      type_en: cat.typeName.toLowerCase().replace(/\s+/g, '-'),
      type_count: cat._count.id
    }));

    // Build response
    const response = {
      code: 1,
      msg: "数据列表",
      page: 1,
      pagecount: 1,
      limit: String(list.length),
      total: list.length,
      list
    };

    // Cache result
    cachedCategories = response;
    cacheTime = now;

    return Response.json(response);

  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return Response.json({
      code: 0,
      msg: "获取分类失败"
    }, { status: 500 });
  }
}
```

## Next Steps

1. Run analysis script to see actual data
2. Verify category structure matches expectations
3. Implement categories endpoint
4. Test with your MacCMS client
5. Add to main API documentation

## Files Created

- `/Users/aurora/Developer/Work/phub-api-v3/docs/CATEGORY_ANALYSIS.md` - Detailed technical analysis
- `/Users/aurora/Developer/Work/phub-api-v3/docs/CATEGORY_FINDINGS.md` - This summary
- `/Users/aurora/Developer/Work/phub-api-v3/scripts/analyze-categories.ts` - Full analysis script
- `/Users/aurora/Developer/Work/phub-api-v3/scripts/quick-category-check.ts` - Quick data check
