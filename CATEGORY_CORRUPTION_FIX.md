# Category Data Corruption Fix - Production Deployment Guide

## Problem Summary
Videos in the database have duplicate `(typeId, typeName)` pairs where the same `typeId` has different `typeName` values. Example:
- `typeId=1` appears with both `typeName="Asian"` AND `typeName="Unknown"`
- This violates data consistency and causes the UI to show duplicate categories

**Root Cause:** The video scraper's upsert logic never updated `typeId` and `typeName` on subsequent scrapes, only on initial insert.

## Solution Overview
This fix implements a 3-step solution:
1. **Code fix** - Update upsert logic to refresh category info on rescrape
2. **Database cleanup** - Fix existing corrupted data and add FK constraint
3. **Verification** - Ensure all data is now consistent

---

## Deployment Steps

### Step 1: Deploy Code Changes (NO DATABASE CHANGES YET)

```bash
# 1. Pull the updated code
git pull

# 2. This includes:
#    - Updated src/app/api/scraper/videos/route.ts (upsert now updates typeId/typeName)
#    - New migration file (not applied yet)
#    - New cleanup script

# 3. Type check
npm run typecheck

# 4. Lint
npm run lint

# 5. Build (optional, but recommended)
npm run build

# 6. Commit and push
git add .
git commit -m "fix: update video upsert to refresh category info on rescrape"
git push
```

### Step 2: Backup Database (CRITICAL)

```bash
# Backup your database before running migrations
# Using Supabase CLI (if applicable):
supabase db pull

# Or using your database tool:
# mysqldump -u user -p database_name > backup_$(date +%s).sql
```

### Step 3: Run Cleanup Script (ANALYSIS MODE FIRST)

```bash
# First, analyze what needs to be fixed (no changes made)
npm run ts-node -- src/scripts/cleanup-category-duplicates.ts

# This will show:
# - Total orphaned videos (typeId with no matching Category)
# - Total mismatched videos (typeId exists but typeName doesn't match)
# - Which categories are affected

# Review the output carefully
```

### Step 4: Run Cleanup Script (FIX MODE)

```bash
# Actually apply the fixes
npm run ts-node -- src/scripts/cleanup-category-duplicates.ts --fix

# This will:
# 1. Fix orphaned typeIds (assign to typeId=1 "Amateur")
# 2. Update all mismatched typeNames to match their Category entries
# 3. Run verification to confirm all issues are fixed

# Expected output:
# ✅ All issues fixed! Data is now consistent.
```

### Step 5: Apply Database Migration

```bash
# This adds:
# - Foreign key constraint (prevents future orphaned categories)
# - Index on (typeId, typeName) for faster queries

npm run migrate

# The migration will:
# 1. Update any remaining orphaned typeIds (shouldn't be any after cleanup)
# 2. Fix any remaining mismatched typeNames
# 3. Add FK constraint
# 4. Add index for duplicate detection
```

### Step 6: Update Database Schema

```bash
# Regenerate Prisma types to include FK relation
npm run generate

# This adds proper TypeScript types for the new foreign key relationship
```

### Step 7: Verify the Fix

```bash
# Run verification queries to confirm everything is correct
npm run ts-node -- src/scripts/cleanup-category-duplicates.ts

# Expected output:
# ✅ No issues found! Your data is clean.
# ✅ Foreign key constraint exists: Video_typeId_fkey
```

---

## Verification Queries (Manual Check)

Run these in your database to verify the fix:

```sql
-- Check that all videos have valid categories
SELECT
  COUNT(*) as total_videos,
  SUM(CASE WHEN typeId IN (SELECT id FROM Category) THEN 1 ELSE 0 END) as valid_category_count,
  SUM(CASE WHEN typeId NOT IN (SELECT id FROM Category) THEN 1 ELSE 0 END) as orphaned_count
FROM Video;

-- Should show: total_videos = valid_category_count (orphaned_count = 0)

-- Check for mismatched typeNames
SELECT
  v.typeId,
  v.typeName,
  c.name as correct_name,
  COUNT(*) as count
FROM Video v
LEFT JOIN Category c ON v.typeId = c.id
WHERE v.typeName != c.name
GROUP BY v.typeId, v.typeName;

-- Should return: 0 rows (no mismatches)

-- Check for duplicate category listings
SELECT
  typeId,
  COUNT(DISTINCT typeName) as name_variants,
  GROUP_CONCAT(DISTINCT typeName) as names,
  COUNT(*) as video_count
FROM Video
GROUP BY typeId
HAVING COUNT(DISTINCT typeName) > 1;

-- Should return: 0 rows (no duplicates per typeId)
```

---

## Rollback Plan

If something goes wrong:

### Rollback Migration
```bash
# Revert the database migration
npm run migrate:rollback

# This will:
# 1. Remove the FK constraint
# 2. Remove the index
# 3. Data changes remain (they're safe and actually fix issues)
```

### Rollback Code
```bash
# Revert the upsert logic to old behavior
git revert <commit-hash>
git push

# But keep the cleanup script - it's optional and safe to run
```

### Restore from Backup
```bash
# If needed, restore your database backup
# mysql -u user -p database_name < backup_*.sql
```

---

## Key Changes

### 1. Upsert Logic Update
**File:** `src/app/api/scraper/videos/route.ts` (lines 245-246)

**Before:**
```typescript
update: {
  vodName: finalTitle,
  // ... other fields ...
  // ❌ typeId and typeName NOT updated on rescrape
}
```

**After:**
```typescript
update: {
  vodName: finalTitle,
  typeId: typeId,         // ✅ Now updates category info
  typeName: typeName,     // ✅ Now updates category name
  // ... other fields ...
}
```

**Impact:** Future scrapes will correctly update category info if a video is found in a different category.

### 2. Database Migration
**File:** `prisma/migrations/20241029_add_category_fk_and_fix_duplicates/migration.sql`

**Changes:**
- Fix orphaned typeIds
- Update mismatched typeNames
- Add foreign key constraint: `Video.typeId → Category.id`
- Add index on `(typeId, typeName)`

**Impact:** Prevents future data corruption and speeds up category queries.

### 3. Cleanup Script
**File:** `src/scripts/cleanup-category-duplicates.ts`

**Functionality:**
- Analyze category issues
- Fix orphaned/mismatched data
- Verify FK constraint exists
- Dry-run mode to preview changes

**Usage:** Safe to run multiple times, idempotent.

---

## Expected Results

Before fix:
```
Videos by Category (showing duplicates):
- asian #1: 3081 videos
- Unknown #1: 314 videos  ← DUPLICATE!
- orgy #2: 3407 videos
- Unknown #2: 451 videos  ← DUPLICATE!
```

After fix:
```
Videos by Category (no duplicates):
- asian #1: 3081 videos
- orgy #2: 3407 videos
- (videos that were "Unknown #1" now properly categorized or assigned to "Amateur")
```

---

## Timeline

Total time needed: ~30 minutes
- Code deployment: 5 min
- Database backup: 5 min
- Cleanup analysis: 2 min
- Cleanup fix: 5 min
- Migration: 2 min
- Schema generation: 2 min
- Verification: 3 min

---

## Support

If you encounter issues:

1. **Check migration logs:** `npm run migrate`
2. **Run cleanup again:** `npm run ts-node -- src/scripts/cleanup-category-duplicates.ts`
3. **Review verification queries:** Run the SQL above
4. **Rollback if needed:** See rollback section

---

## Notes

- This fix is **100% backwards compatible**
- The cleanup script is **idempotent** (safe to run multiple times)
- The migration uses **RESTRICT on delete** to prevent accidental category deletion
- All changes are **logged** for audit trail
- The FK constraint ensures **data consistency going forward**
