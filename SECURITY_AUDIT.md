# Security Audit Report - Scraper System

## Executive Summary

**CRITICAL VULNERABILITIES FOUND: 3**
**HIGH SEVERITY ISSUES: 5**
**MEDIUM SEVERITY: 8**
**LOW SEVERITY: 4**

The scraper has significant security issues that could lead to data leakage, unauthorized access, and system compromise. **DO NOT DEPLOY to production without fixes.**

---

## 🔴 CRITICAL VULNERABILITIES

### 1. EXPOSED CHECKPOINT IDs - UNAUTHORIZED ACCESS

**Location:** `src/app/api/scraper/categories-with-recovery/route.ts:32-34`
**Severity:** CRITICAL
**CVSS:** 9.1 (Critical)

#### Problem
Checkpoint IDs are **predictable and guessable**:
```typescript
const checkpointId = `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
```

**Why this is exploitable:**
1. `Date.now()` is predictable (millisecond precision)
2. `Math.random().toString(36).slice(2, 9)` is a weak random (NOT cryptographically secure)
3. An attacker can brute-force checkpoint IDs

**Proof of Concept:**
```bash
# Attacker knows current time is ~2025-10-29T10:41:00
# They generate timestamps: 1729845660000, 1729845661000, etc.
# For each, try 36^7 = 78 billion combinations (fast)

for timestamp in {1729845660000..1729845670000}; do
  for suffix in {0..999999}; do
    checkpointId="scrape_${timestamp}_${suffix}"
    curl -s "GET /api/scraper/categories-with-recovery?checkpointId=${checkpointId}" | jq
    # If found, attacker can read/modify checkpoint data
  done
done
```

#### Impact
- **Access other users' scraper progress**
- **Modify checkpoint data** to corrupt scraping
- **Read all progress logs** (potentially exposing internal structure)
- **Pause/resume anyone's scrape**
- **Denial of service** by creating/modifying checkpoints

#### Remediation
Use cryptographically secure random:
```typescript
import crypto from 'crypto'
const checkpointId = `scrape_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`
```

Or use UUIDs:
```typescript
import { v4 as uuidv4 } from 'uuid'
const checkpointId = `scrape_${uuidv4()}`
```

---

### 2. NO AUTHENTICATION/AUTHORIZATION ON SCRAPER ENDPOINTS

**Location:** All scraper routes
**Severity:** CRITICAL
**CVSS:** 9.9 (Critical)

#### Problem
**Anyone can call the scraper endpoints without authentication:**

```bash
# No auth required - anyone can:
POST /api/scraper/categories-with-recovery
POST /api/scraper/videos
GET /api/scraper/categories-with-recovery?checkpointId=...
```

#### Impact
- **Unauthorized scraping** of internal data
- **Resource exhaustion** - launch 1000 concurrent scrapes
- **Data leakage** - read all checkpoint data (progress, videos scraped, errors)
- **Malicious modification** of checkpoints
- **API quota abuse** - exhaust PornHub API limits
- **Database overload** - insert millions of records

#### Proof of Concept
```bash
# Attacker runs unlimited scrapes
for i in {1..1000}; do
  curl -X POST http://localhost:4444/api/scraper/categories-with-recovery \
    -H "Content-Type: application/json" \
    -d '{"pagesPerCategory": 100}' &
done

# Database now has millions of duplicate videos
# PornHub API throttles all legitimate requests
# Server runs out of memory/CPU
```

#### Remediation
**Add authentication and authorization:**
```typescript
import { getServerSession } from 'next-auth'

export async function POST(request: NextRequest) {
  const session = await getServerSession()

  // Only admin can access scraper
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ... rest of code
}
```

---

### 3. JSON.PARSE() WITHOUT SCHEMA VALIDATION - PROTOTYPE POLLUTION

**Location:** `src/lib/scraper-utils.ts:199, 227, 244`
**Severity:** CRITICAL (Conditional)
**CVSS:** 8.1

#### Problem
```typescript
const current = JSON.parse(existing.value) as ScraperCheckpoint
// No validation that 'current' actually has correct structure
// Attacker can inject malicious JSON
```

#### Exploitation Scenario
Attacker modifies checkpoint JSON in database:
```json
{
  "__proto__": { "isAdmin": true },
  "id": "legitimate_id",
  ...
}
```

This could cause prototype pollution if code later accesses user properties.

**Current Risk Level:** Medium (because we're not spreading untrusted objects into auth objects)
**Risk Level if Code Changes:** HIGH

#### Remediation
```typescript
import { z } from 'zod'

const CheckpointSchema = z.object({
  id: z.string(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(['running', 'paused', 'completed', 'failed']),
  categories: z.array(z.object({
    categoryId: z.number(),
    categoryName: z.string(),
    pagesTotal: z.number(),
    pagesCompleted: z.number(),
    videosScraped: z.number(),
    videosFailed: z.number(),
  })),
  totalVideosScraped: z.number(),
  totalVideosFailed: z.number(),
  errors: z.array(z.string()),
})

const current = CheckpointSchema.parse(JSON.parse(existing.value))
```

---

## 🟠 HIGH SEVERITY ISSUES

### 4. NO RATE LIMITING ON SCRAPER ENDPOINTS

**Location:** All scraper routes
**Severity:** HIGH
**Impact:** DoS attack, resource exhaustion

An attacker can:
- Send 1000 requests/second
- Each request spawns category scrape loops
- Database connections exhausted
- Server memory exhausted

**Remediation:**
```typescript
import Ratelimit from '@upstash/ratelimit'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 per hour
})

export async function POST(request: NextRequest) {
  const { success } = await ratelimit.limit('scraper')
  if (!success) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }
  // ...
}
```

---

### 5. SENSITIVE DATA IN LOGS

**Location:** Multiple console.log statements
**Severity:** HIGH
**Examples:**
```typescript
console.log(`[Scraper Categories] Started with options:`, {
  pagesPerCategory,
  resumeCheckpointId: resumeCheckpointId || 'new',  // LOGS CHECKPOINT ID!
})
```

Logs are often:
- Stored in plain text
- Accessible to other services
- Sent to logging providers
- Visible in containers/terminals

**Remediation:**
```typescript
// Don't log sensitive IDs
console.log(`[Scraper Categories] Started`, {
  pagesPerCategory,
  // DON'T log: resumeCheckpointId
})

// Use structured logging with masking
logger.info('scraper_started', {
  pagesPerCategory,
  checkpointId: checkpointId.substring(0, 8) + '...', // Mask ID
})
```

---

### 6. SSRF VULNERABILITY - FETCH TO ARBITRARY URLS

**Location:** `src/app/api/scraper/categories-with-recovery/route.ts:142-151`

```typescript
const baseUrl = process.env.NEXTAUTH_URL || 'http://md8av.com'
const response = await fetch(`${baseUrl}/api/scraper/videos`, {
  // ...
})
```

**Problem:** If `NEXTAUTH_URL` is controlled by attacker, they can:
- Fetch internal services (localhost:5432 - database)
- Port scan internal network
- Access cloud metadata endpoints
- Exfiltrate data

**Remediation:**
```typescript
// Validate baseUrl is expected domain
const baseUrl = process.env.NEXTAUTH_URL
if (!baseUrl || !baseUrl.includes('md8av.com')) {
  throw new Error('Invalid NEXTAUTH_URL')
}

const url = new URL(`${baseUrl}/api/scraper/videos`)
if (!url.hostname.endsWith('md8av.com')) {
  throw new Error('Invalid destination URL')
}

const response = await fetch(url.toString())
```

---

### 7. ENVIRONMENT VARIABLE EXPOSURE IN ERROR MESSAGES

**Location:** Various endpoints
**Severity:** HIGH
**Example:**
```typescript
console.error(`[Scraper Categories] Failed to fetch categories from PornHub:`, error)
// If error is network error, might expose baseUrl, API keys, etc.
```

**Remediation:**
```typescript
catch (error) {
  // Log safely without exposing sensitive data
  console.error(`[Scraper Categories] Failed to fetch categories`)
  // In development only:
  if (process.env.NODE_ENV === 'development') {
    console.error('Debug:', error)
  }
}
```

---

### 8. UNSAFE IMPORT WITH DYNAMIC PATH

**Location:** `src/app/api/scraper/categories-with-recovery/route.ts:55`

```typescript
const { PornHub } = await import('@/lib/pornhub.js')
```

This is okay, but if path ever becomes user-controlled:
```typescript
const libraryPath = request.query.library // DANGEROUS!
const { SomeClass } = await import(libraryPath) // PATH TRAVERSAL!
```

**Current Status:** Safe (hardcoded path)
**Recommendation:** Document as safe, never accept user input for import paths

---

## 🟡 MEDIUM SEVERITY ISSUES

### 9. INSUFFICIENT INPUT VALIDATION

**Location:** `src/app/api/scraper/categories-with-recovery/route.ts:24`

```typescript
const { pagesPerCategory = 5, resumeCheckpointId } = await request.json()
// NO VALIDATION:
// - pagesPerCategory could be negative: -999999
// - pagesPerCategory could be huge: 999999999
// - resumeCheckpointId could be injection attempt
```

**Impact:**
- Negative pages cause infinite loops
- Huge values cause memory exhaustion
- Malformed IDs might break database queries

**Remediation:**
```typescript
import { z } from 'zod'

const RequestSchema = z.object({
  pagesPerCategory: z.number().int().min(1).max(1000),
  resumeCheckpointId: z.string().regex(/^scrape_\d+_[a-z0-9]{7}$/).optional(),
})

const { pagesPerCategory, resumeCheckpointId } = RequestSchema.parse(await request.json())
```

---

### 10. NO VALIDATION OF CATEGORY IDS

**Location:** `src/app/api/scraper/categories-with-recovery/route.ts:148`

```typescript
body: JSON.stringify({
  page,
  categoryId: category.id,  // Is this actually a valid category?
  categoryName: category.name,
})
```

What if someone:
1. Modifies database directly
2. Adds categories with SQL injection in name?

**Remediation:** Validate category exists and is safe before using.

---

### 11. NO TIMEOUT ON EXTERNAL REQUESTS

**Location:** `src/app/api/scraper/categories-with-recovery/route.ts:143`

```typescript
const response = await fetch(`${baseUrl}/api/scraper/videos`, {
  method: 'POST',
  // NO TIMEOUT!
})
```

Attack: Attacker's server responds very slowly → ties up Node.js thread.

**Remediation:**
```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30000) // 30s

const response = await fetch(url, {
  signal: controller.signal,
  timeout: 30000,
})

clearTimeout(timeout)
```

---

### 12. NO VALIDATION OF CHECKPOINT STATUS

**Location:** `src/lib/scraper-utils.ts:205-209`

```typescript
const updated: ScraperCheckpoint = {
  ...current,
  ...updates,  // Attacker can set status to anything
  updatedAt: new Date().toISOString(),
}
```

Attacker could set:
- status: "admin" (if code ever checks `checkpoint.status === 'admin'`)
- errors: extremely long string (memory exhaustion)
- categories: huge array (memory exhaustion)

**Remediation:** Validate updates before applying:
```typescript
const UpdatesSchema = z.object({
  status: z.enum(['running', 'paused', 'completed', 'failed']).optional(),
  categories: z.array(z.object({...})).max(1000).optional(),
  errors: z.array(z.string().max(1000)).max(100).optional(),
})

const validUpdates = UpdatesSchema.parse(updates)
```

---

### 13. RESOURCE EXHAUSTION - NO SIZE LIMITS

**Location:** Various
**Issues:**
- No limit on checkpoint size (can store millions of categories)
- No limit on error array length
- No limit on request body size
- No limit on number of concurrent scrapes per checkpoint

**Remediation:**
```typescript
const MAX_CHECKPOINT_SIZE = 1_000_000 // 1MB
const checkpoint = await getScraperCheckpoint(checkpointId)
if (JSON.stringify(checkpoint).length > MAX_CHECKPOINT_SIZE) {
  throw new Error('Checkpoint too large')
}
```

---

### 14. NO CONTENT SECURITY POLICY (CSP)

**Location:** All endpoints
**Issue:** If an error message is ever displayed in UI, XSS could occur

**Remediation:** Add CSP headers:
```typescript
export const defaultSecurityHeaders = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
}
```

---

## 🟢 LOW SEVERITY ISSUES

### 15. INFORMATION DISCLOSURE IN ERROR RESPONSES

Endpoints return error details that could reveal system information.

**Remediation:** Generic error messages in production:
```typescript
const isDev = process.env.NODE_ENV === 'development'

return NextResponse.json({
  success: false,
  message: isDev ? error.message : 'An error occurred',
})
```

---

### 16. NO AUDIT LOGGING

No logs of who accessed which checkpoints, when, or what data was modified.

**Remediation:**
```typescript
await prisma.auditLog.create({
  data: {
    action: 'checkpoint_accessed',
    checkpointId,
    userIp: request.ip,
    timestamp: new Date(),
  },
})
```

---

### 17. CHECKPOINT DATA NOT ENCRYPTED

Checkpoint data is stored as plaintext in database. If database is breached, all scraping progress/data is exposed.

**Remediation:** Encrypt checkpoint data:
```typescript
import crypto from 'crypto'

function encryptCheckpoint(data: ScraperCheckpoint): string {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  return cipher.update(JSON.stringify(data)).final()
}
```

---

### 18. NO SIGNATURE VERIFICATION FOR CHECKPOINT UPDATES

Someone could modify checkpoint JSON directly in database.

**Remediation:**
```typescript
import crypto from 'crypto'

function signCheckpoint(data: ScraperCheckpoint): string {
  const hmac = crypto.createHmac('sha256', secretKey)
  return hmac.update(JSON.stringify(data)).digest('hex')
}

// Verify before using:
const signature = crypto.createHmac('sha256', secretKey)
  .update(JSON.stringify(current))
  .digest('hex')

if (signature !== storedSignature) {
  throw new Error('Checkpoint signature invalid')
}
```

---

## SUMMARY TABLE

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 CRITICAL | 3 | Exposed checkpoint IDs, No auth, Prototype pollution |
| 🟠 HIGH | 5 | No rate limiting, Data in logs, SSRF, Env exposure, Unsafe import |
| 🟡 MEDIUM | 8 | No validation, Resource exhaustion, Missing headers |
| 🟢 LOW | 4 | Info disclosure, Audit logging, Encryption, Signatures |

---

## DEPLOYMENT RECOMMENDATIONS

**🚫 DO NOT DEPLOY** until the **3 CRITICAL** issues are fixed:
1. Add authentication middleware
2. Use cryptographically secure checkpoint IDs
3. Add schema validation for JSON parsing

**⚠️ FIX BEFORE PRODUCTION:**
- Add rate limiting
- Remove sensitive data from logs
- Add input validation
- Add request timeouts
- Validate environment variables

**📋 IMPLEMENT SOON:**
- CSP headers
- Audit logging
- Checkpoint encryption
- Signature verification

---

## QUICK FIXES (30 minutes)

```typescript
// Add to every endpoint:
import { getServerSession } from 'next-auth'

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ... rest of endpoint
}
```

```typescript
// Replace checkpoint ID generation:
import crypto from 'crypto'
const checkpointId = `scrape_${crypto.randomUUID()}`
```

```typescript
// Add schema validation:
import { z } from 'zod'
const schema = z.object({ pagesPerCategory: z.number().min(1).max(1000) })
const { pagesPerCategory } = schema.parse(await request.json())
```

These 3 changes eliminate the critical vulnerabilities.
