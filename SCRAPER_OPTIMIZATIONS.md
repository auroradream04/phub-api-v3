# Scraper Optimizations & Crash Recovery Guide

## 📋 Overview

This document covers all optimizations made to the scraper and how to use the crash recovery system.

---

## 🔧 Critical Fixes Applied

### Fix #1: Numeric Parsing Validation
**Problem:** NaN values silently stored in database
```typescript
// BEFORE (bad)
const views = Math.floor(parseFloat(viewsStr.replace('K', ''))) // NaN if parse fails

// AFTER (good)
const views = parseViews(viewsStr) // Validates, logs warnings, returns 0 on error
```

**Impact:** All number parsing now validated with error logging

### Fix #2: Category String Length Validation
**Problem:** Unbounded category concatenation could exceed database limit
```typescript
// BEFORE (bad)
vodClass = existingCategories.join(',') // Could exceed 500 chars

// AFTER (good)
vodClass = mergeCategories(existing, newCat) // Auto-capped at 450 chars
```

**Impact:** Safe category merging with explicit length validation

### Fix #3: Race Condition Protection
**Problem:** Concurrent requests could lose category updates
```typescript
// BEFORE (bad)
const existing = await prisma.video.findUnique(...)
if (existing) { /* merge */ }
await prisma.video.upsert(...) // Time between read and write = race condition

// AFTER (good)
await prisma.$transaction(async (tx) => {
  const existing = await tx.video.findUnique(...)
  await tx.video.upsert(...) // Atomic - no race condition
})
```

**Impact:** Category merging now atomic and safe for concurrent requests

### Fix #4: Circuit Breaker for Failures
**Problem:** Keeps retrying after too many failures
```typescript
// BEFORE (bad)
for (let attempt = 1; attempt <= 3; attempt++) {
  // Retries even if clear pattern of failure
}

// AFTER (good)
const breaker = new CircuitBreaker()
if (!breaker.canAttempt()) return
// Auto-opens after 3 failures, prevents cascading retries
```

**Impact:** Faster failure detection, stops wasting requests

### Fix #5: Proxy Health Tracking
**Problem:** Dead proxies used repeatedly
```typescript
// BEFORE (bad)
const proxy = proxyList[Math.floor(Math.random() * proxyList.length)]
// Could pick same dead proxy 10 times in a row

// AFTER (good)
const scorer = new ProxyScorer()
scorer.recordSuccess(proxy)
scorer.recordFailure(proxy)
scorer.getScore(proxy) // Returns 0-1 based on success rate
```

**Impact:** Proxies with >90% failure rate get blacklisted

---

## ⚡ Performance Optimizations

### Optimization 1: Exponential Backoff
```typescript
// Instead of fixed 500ms delay everywhere, use exponential backoff
// Attempt 1: 100ms
// Attempt 2: 500ms
// Attempt 3: 2500ms
const delay = getExponentialBackoff(attempt)
```

**Impact:** Faster recovery on temporary failures, slower retry on persistent issues

### Optimization 2: Database Batch Operations
```typescript
// TODO: Update video scraper to use:
await prisma.video.createMany({
  data: videosArray,
  skipDuplicates: true,
})
// Falls back to individual upsert if batch fails
```

**Expected Impact:** 5-10x faster database inserts

### Optimization 3: Settings Caching
```typescript
// TODO: Cache settings for scraping session
const settings = await getScraperSettings() // Cached for 1 hour
// Pass to scraper instead of querying per-video
```

**Expected Impact:** Reduce database queries from 20,000 to 5

### Optimization 4: Connection Pooling
```typescript
// TODO: Reuse PornHub instances instead of creating new ones
const pornhubPool = new Map<string, PornHub>()
// Reuse instance for each category, not per-request
```

**Expected Impact:** Reduce HTTP handshakes, better connection reuse

### Optimization 5: Translation Cache Improvements
```typescript
// Currently: Unbounded in-memory cache
// TODO: Implement LRU cache with max 100k entries
const cache = new LRUCache({ max: 100000, ttl: 86400000 })
```

**Expected Impact:** Memory bounded, automatic expiration of old translations

---

## 🔄 Crash Recovery System

### How It Works

The scraper now saves checkpoints during scraping. If it crashes, you can resume from where you left off.

### Usage: Starting a Scrape

```bash
curl -X POST http://localhost:4444/api/scraper/categories-with-recovery \
  -H "Content-Type: application/json" \
  -d '{
    "pagesPerCategory": 5,
    "parallel": false,
    "batchSize": 5
  }'

# Returns:
# {
#   "success": true,
#   "checkpointId": "scrape_1729785600000_abc123",
#   "totalVideosScraped": 0,
#   "totalVideosFailed": 0
# }
```

### Usage: Checking Progress

```bash
curl "http://localhost:4444/api/scraper/categories-with-recovery?checkpointId=scrape_1729785600000_abc123"

# Returns:
# {
#   "success": true,
#   "checkpoint": {
#     "id": "scrape_1729785600000_abc123",
#     "status": "running",
#     "totalVideosScraped": 1250,
#     "totalVideosFailed": 3,
#     "categories": [
#       {
#         "categoryId": 1,
#         "categoryName": "asian",
#         "pagesCompleted": 3,
#         "pagesTotal": 5,
#         "videosScraped": 250,
#         "videosFailed": 1
#       }
#     ]
#   },
#   "progress": {
#     "status": "running",
#     "totalVideosScraped": 1250,
#     "categoriesCompleted": 0,
#     "categoriesInProgress": 50
#   }
# }
```

### Usage: Resuming After Crash

If the scraper crashes while running:

```bash
# Just call the same endpoint with the checkpointId
curl -X POST http://localhost:4444/api/scraper/categories-with-recovery \
  -H "Content-Type: application/json" \
  -d '{
    "pagesPerCategory": 5,
    "resumeCheckpointId": "scrape_1729785600000_abc123"
  }'

# It will:
# 1. Load the checkpoint
# 2. Skip already-completed categories
# 3. Resume from where it left off
# 4. Continue scraping
```

### Checkpoint Data Structure

Checkpoints are stored in `SiteSetting` table with key `checkpoint_{checkpointId}`:

```typescript
{
  "id": "scrape_1729785600000_abc123",
  "startedAt": "2025-10-29T18:00:00Z",
  "updatedAt": "2025-10-29T18:15:00Z",
  "status": "running|completed|failed|paused",
  "categories": [
    {
      "categoryId": 1,
      "categoryName": "asian",
      "pagesTotal": 5,
      "pagesCompleted": 3,
      "videosScraped": 250,
      "videosFailed": 1
    }
  ],
  "totalVideosScraped": 1250,
  "totalVideosFailed": 3,
  "errors": [
    "Rate limited on category 1, page 4",
    "Connection timeout on category 2, page 1"
  ]
}
```

---

## 📊 Performance Expectations

### Before Optimizations
- **Duration:** 12+ hours for 100k videos
- **Failures:** Unknown (silent NaN values)
- **Recovery:** Start from 0 if crash
- **Resource usage:** Unbounded memory for translations

### After Optimizations (Estimated)
- **Duration:** 4-6 hours for 100k videos (with batch ops + caching)
- **Failures:** Logged and tracked
- **Recovery:** Resume from last checkpoint (could save 8+ hours)
- **Resource usage:** Bounded at ~100k translations cached

### Actual Performance Depends On:
- Proxy quality (dead proxies = slower)
- Network connection speed
- Database performance
- PornHub rate limiting tolerance

---

## 🔨 Implementation Checklist

- ✅ Numeric parsing validation (completed)
- ✅ Category length validation (completed)
- ✅ Race condition protection (completed)
- ✅ Circuit breaker pattern (completed)
- ✅ Proxy scoring (completed)
- ✅ Exponential backoff (completed)
- ✅ Crash recovery checkpoints (completed)
- ⏳ Batch database operations (pending)
- ⏳ Settings caching (pending)
- ⏳ PornHub connection pooling (pending)
- ⏳ LRU translation cache (pending)

---

## 🚀 Starting Your 12-Hour Scrape

### Step 1: Start the Scraper
```bash
curl -X POST http://localhost:4444/api/scraper/categories-with-recovery \
  -H "Content-Type: application/json" \
  -d '{"pagesPerCategory": 5}' > scrape_response.json

# Extract and save the checkpointId
CHECKPOINT_ID=$(jq -r '.checkpointId' scrape_response.json)
echo $CHECKPOINT_ID  # Save this somewhere!
```

### Step 2: Monitor Progress
```bash
# Check status every hour
watch -n 3600 "curl -s \"http://localhost:4444/api/scraper/categories-with-recovery?checkpointId=$CHECKPOINT_ID\" | jq '.progress'"
```

### Step 3: If Crash Occurs
```bash
# Check if still running
curl -s "http://localhost:4444/api/scraper/categories-with-recovery?checkpointId=$CHECKPOINT_ID"

# If status is not "completed", resume:
curl -X POST http://localhost:4444/api/scraper/categories-with-recovery \
  -H "Content-Type: application/json" \
  -d "{\"pagesPerCategory\": 5, \"resumeCheckpointId\": \"$CHECKPOINT_ID\"}"
```

### Step 4: Verify Completion
```bash
# Check final status
curl -s "http://localhost:4444/api/scraper/categories-with-recovery?checkpointId=$CHECKPOINT_ID" | jq '.progress'

# Should show:
# {
#   "status": "completed",
#   "totalVideosScraped": 50000,
#   "categoriesCompleted": 50,
#   "categoriesInProgress": 50
# }
```

---

## 📋 Troubleshooting

### Issue: "Checkpoint not found"
- The checkpoint data may have been deleted
- Start a new scrape: `POST /api/scraper/categories-with-recovery`

### Issue: "Missing category X after resume"
- Checkpoint only tracks categories it has encountered
- Resuming will start fresh with missing categories
- Safe to resume multiple times

### Issue: High failure rate on category X
- Likely rate limiting from PornHub
- Circuit breaker will skip after 3 failures
- Try with better proxies or smaller batch size

### Issue: Memory growing during scrape
- Translation cache is growing
- Restart server to clear
- TODO: Implement LRU cache with max size

### Issue: Scraper very slow
- Check proxy health: Most proxies dead?
- Check network: Is connection slow?
- Check database: Run `EXPLAIN` on queries
- Consider using batch operations (pending optimization)

---

## 🎯 Next Steps

After you've tested crash recovery, implement the pending optimizations:

1. **Batch database operations** - 5-10x faster inserts
2. **Settings caching** - Reduce DB queries 4000x
3. **Connection pooling** - Better resource reuse
4. **LRU translation cache** - Bounded memory usage

These will bring your 12-hour scrape down to 4-6 hours.
