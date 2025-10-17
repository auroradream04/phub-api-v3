# Category Storage Analysis for MacCMS API

## Schema Investigation

### Video Model Category Fields

Based on `/Users/aurora/Developer/Work/phub-api-v3/prisma/schema.prisma`:

```prisma
model Video {
  typeId      Int      // Category type_id (primary category)
  typeName    String   @db.VarChar(100)  // Primary category name
  vodClass    String?  @db.VarChar(500)  // Comma-separated category names (e.g., "Asian,Babe,Teen")

  @@index([typeId])
}
```

### Key Findings

1. **Primary Category**
   - `typeId`: Integer ID of the main category
   - `typeName`: String name of the main category
   - **Indexed**: Fast lookups by typeId
   - Each video has exactly ONE primary category

2. **Secondary Categories (Tags)**
   - `vodClass`: Comma-separated string of ALL categories/tags
   - Can be null
   - Contains multiple categories per video
   - Example: `"Asian,Babe,Teen,Hardcore"`

3. **Data Structure**
   - Videos use PornHub's category system
   - Custom categories added: "japanese", "chinese"
   - Categories stored in both places for flexibility

## Category Extraction Strategies

### Option 1: Primary Categories Only (RECOMMENDED)
**Use Case**: Simple category list for navigation

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

// Result: Array of { typeId, typeName, _count: { id: number } }
```

**Pros:**
- Fast query (uses index)
- Simple to implement
- One category per video (clean)
- Consistent typeId mapping

**Cons:**
- Misses secondary categories
- Limited to PornHub's primary categories

### Option 2: All Categories from vodClass
**Use Case**: Complete tag cloud, comprehensive filtering

```typescript
// 1. Get all vodClass values
const videos = await prisma.video.findMany({
  select: { vodClass: true },
  where: { vodClass: { not: null } }
});

// 2. Parse and aggregate
const categoryMap = new Map<string, number>();
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
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count);
```

**Pros:**
- Captures ALL categories including custom ones
- Better for search/filtering
- More accurate video classification

**Cons:**
- Slower query (no index on vodClass)
- Needs parsing/aggregation
- No consistent category IDs
- Higher memory usage

### Option 3: Hybrid Approach (BEST FOR MACCMS)
**Use Case**: Primary categories with counts, plus tag cloud

```typescript
// 1. Get primary categories (fast)
const primaryCategories = await prisma.video.groupBy({
  by: ['typeId', 'typeName'],
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } }
});

// 2. Build MacCMS format
const categoryList = primaryCategories.map(cat => ({
  type_id: cat.typeId,
  type_name: cat.typeName,
  type_en: cat.typeName.toLowerCase().replace(/\s+/g, '-'),
  type_count: cat._count.id
}));
```

## MacCMS API Format

### Expected Response Format

```json
{
  "code": 1,
  "msg": "数据列表",
  "page": 1,
  "pagecount": 1,
  "limit": "20",
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

## Category ID Mapping

### Consistency Check Needed

Run this query to verify typeId consistency:

```sql
SELECT typeId, GROUP_CONCAT(DISTINCT typeName) as names, COUNT(DISTINCT typeName) as name_count
FROM Video
GROUP BY typeId
HAVING name_count > 1;
```

**Expected Result**: Empty (each typeId should have only one typeName)

If inconsistencies exist, we need a category mapping table.

## Custom Categories

Custom categories added to the system:
- `japanese` - Japanese content
- `chinese` - Chinese content
- `asian` - Asian content (may already exist in PornHub)

**Location**: These are stored in `vodClass` field, possibly also as primary categories

**Verification Query**:
```typescript
const customCatCount = await prisma.video.count({
  where: {
    OR: [
      { typeName: { contains: 'japanese', mode: 'insensitive' } },
      { typeName: { contains: 'chinese', mode: 'insensitive' } },
      { vodClass: { contains: 'japanese' } },
      { vodClass: { contains: 'chinese' } }
    ]
  }
});
```

## Implementation Recommendations

### For MacCMS Categories Endpoint (`/api.php/provide/vod/?ac=list`)

1. **Use Primary Categories (typeId/typeName)**
   - Fast query performance
   - Consistent with MacCMS expectations
   - Simple integer IDs

2. **Cache the Result**
   - Categories rarely change
   - Cache for 1 hour or invalidate on new scrapes

3. **Include Video Counts**
   - Essential for MacCMS clients
   - Already available via groupBy

4. **Generate English Slugs**
   - `type_en` field required by some clients
   - Simple transformation: lowercase + replace spaces with hyphens

### Sample Implementation

```typescript
// /api/maccms/categories/route.ts
export async function GET() {
  try {
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

    const list = categories.map(cat => ({
      type_id: cat.typeId,
      type_name: cat.typeName,
      type_en: cat.typeName.toLowerCase().replace(/\s+/g, '-'),
      type_count: cat._count.id
    }));

    return Response.json({
      code: 1,
      msg: "数据列表",
      page: 1,
      pagecount: 1,
      limit: String(list.length),
      total: list.length,
      list
    });
  } catch (error) {
    return Response.json({
      code: 0,
      msg: "获取分类失败"
    }, { status: 500 });
  }
}
```

## Data Quality Checks

### Before deploying categories endpoint:

1. **Check for null/empty values**
   ```typescript
   const nullCount = await prisma.video.count({
     where: { OR: [{ typeName: null }, { typeName: '' }] }
   });
   ```

2. **Verify typeId consistency**
   ```typescript
   // Each typeId should map to exactly one typeName
   ```

3. **Count total categories**
   ```typescript
   const categoryCount = await prisma.video.groupBy({
     by: ['typeId']
   });
   // Expect 20-50 categories typically
   ```

4. **Check custom categories**
   ```typescript
   // Verify japanese/chinese categories exist
   ```

## Performance Considerations

### Index Usage
- `typeId` is indexed: ✅ Fast groupBy
- `typeName` is not indexed: ⚠️ Only use in WHERE with typeId
- `vodClass` is not indexed: ❌ Avoid filtering on this

### Query Performance
- Primary category extraction: **< 100ms** (indexed)
- vodClass parsing: **1-5 seconds** (full table scan)

### Optimization
- Cache category list in Redis/memory
- Regenerate on video scrape completion
- Add composite index if filtering by typeName becomes common

## Next Steps

1. Run `/Users/aurora/Developer/Work/phub-api-v3/scripts/analyze-categories.ts` to get actual data
2. Verify category IDs and names
3. Check for inconsistencies
4. Implement categories endpoint
5. Test with MacCMS client
6. Add caching layer

## Test Commands

```bash
# Run category analysis
npx tsx /Users/aurora/Developer/Work/phub-api-v3/scripts/analyze-categories.ts

# Quick check
npx tsx /Users/aurora/Developer/Work/phub-api-v3/scripts/quick-category-check.ts
```
