# TypeId/TypeName Duplicate Corruption Fix

## What's the Problem?

Your database has **data corruption** where videos have duplicate `(typeId, typeName)` pairs:

```
typeId #1 appears with BOTH:
  - typeName = "Asian"    (314 videos)
  - typeName = "Unknown"  (correct count mixed in)

typeId #2 appears with BOTH:
  - typeName = "Orgy"     (3407 videos)
  - typeName = "Unknown"  (451 videos)
```

This causes the UI to show duplicate category entries.

## Why Did This Happen?

The video scraper's upsert logic had a bug:

```typescript
// BAD CODE (what we had):
await prisma.video.upsert({
  where: { vodId: item.video.id },
  update: {
    vodName: finalTitle,
    views: item.views,
    // ❌ Missing: typeId and typeName
  },
  create: {
    typeId: typeId,    // Only set on create
    typeName: typeName,
  }
})
```

So when the **same video** was scraped from a **different category** later:
1. It would try to update the video
2. But `typeId` and `typeName` wouldn't change
3. You'd end up with one video showing as multiple categories

## The Fix

We've implemented **3 things**:

### 1. Code Fix (Prevents Future Issues)
Updated the upsert logic to refresh category fields:
```typescript
// FIXED CODE:
await prisma.video.upsert({
  where: { vodId: item.video.id },
  update: {
    vodName: finalTitle,
    typeId: typeId,         // ✅ Now updates
    typeName: typeName,     // ✅ Now updates
    views: item.views,
  },
  create: { /* ... */ }
})
```

### 2. Database Cleanup (Fixes Existing Data)
A migration that:
- Fixes any orphaned category IDs
- Updates mismatched category names
- Adds a foreign key constraint to prevent future corruption

### 3. Cleanup Script (Handles Edge Cases)
A TypeScript script that:
- Analyzes what's broken
- Fixes it safely
- Verifies the fix worked

## How to Deploy

### Quick Version (Recommended)
```bash
# 1. Backup your database first!

# 2. Run the deployment script
./RUN_PRODUCTION_FIX.sh

# Or with fixes applied:
./RUN_PRODUCTION_FIX.sh --fix
```

### Manual Version
```bash
# 1. Analyze (see what needs fixing)
npm run ts-node -- src/scripts/cleanup-category-duplicates.ts

# 2. Fix it
npm run ts-node -- src/scripts/cleanup-category-duplicates.ts --fix

# 3. Apply database changes
npm run migrate

# 4. Verify
npm run ts-node -- src/scripts/cleanup-category-duplicates.ts
```

## Files Involved

| File | Purpose |
|------|---------|
| `src/app/api/scraper/videos/route.ts` | Fixed upsert logic |
| `prisma/migrations/20241029_*` | Database migration |
| `src/scripts/cleanup-category-duplicates.ts` | Cleanup script |
| `CATEGORY_CORRUPTION_FIX.md` | Detailed deployment guide |
| `RUN_PRODUCTION_FIX.sh` | Automated deployment script |

## What Will Happen After Fix

- No more duplicate category entries in the UI
- All videos will have correct, consistent category assignments
- Future scrapes will properly update category info if a video moves categories
- Database will have a foreign key constraint ensuring data integrity

## Rollback (If Needed)

```bash
# Revert the code changes
git revert <commit-hash>

# Revert the migration
npm run migrate:rollback

# Restore database backup if needed
```

See `CATEGORY_CORRUPTION_FIX.md` for detailed rollback instructions.

## Verification

After deployment, run these queries to verify:

```sql
-- Should return 0 (no orphaned categories)
SELECT COUNT(*) FROM Video WHERE typeId NOT IN (SELECT id FROM Category);

-- Should return 0 (no mismatched names)
SELECT COUNT(*) FROM Video v
WHERE v.typeName != (SELECT name FROM Category WHERE id = v.typeId);

-- Should return 0 (no duplicate names per typeId)
SELECT COUNT(*) FROM (
  SELECT typeId FROM Video GROUP BY typeId
  HAVING COUNT(DISTINCT typeName) > 1
) t;
```

## Timeline

- Analysis: 2 minutes
- Fix execution: 5 minutes  
- Migration: 2 minutes
- Verification: 3 minutes
- **Total: ~12 minutes**

## Need Help?

1. Read `CATEGORY_CORRUPTION_FIX.md` for detailed steps
2. Check `CATEGORY_FIX_SUMMARY.txt` for quick reference
3. Run `./RUN_PRODUCTION_FIX.sh` for guided deployment
4. Check the cleanup script logs for detailed information

## Status

✅ Code fix: Complete  
✅ Migration created: Ready to apply  
✅ Cleanup script: Ready to run  
✅ Documentation: Complete  

**Ready for production deployment**
