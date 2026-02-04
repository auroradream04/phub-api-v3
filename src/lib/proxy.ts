import fs from 'fs'
import path from 'path'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'

// ============================================
// CONFIGURATION
// ============================================
const COOLDOWN_DURATION_MS = 60 * 1000 // 60 seconds cooldown after failures
const CONSECUTIVE_FAILURES_FOR_COOLDOWN = 3 // Failures before cooldown triggers
const HEALTH_DECAY_INTERVAL_MS = 5 * 60 * 1000 // Decay old stats every 5 min
const MIN_SUCCESS_RATE_WEIGHT = 0.1 // Even 0% success rate proxy gets 10% weight

// ============================================
// TYPES
// ============================================
type ProxyAgent = HttpsProxyAgent<string> | HttpProxyAgent<string> | SocksProxyAgent

interface ProxyEntry {
  url: string // Full URL (http://user:pass@host:port)
  hostPort: string // Just host:port for logging
  agent: ProxyAgent | null // Lazily created
}

interface ProxyHealth {
  successes: number
  failures: number
  consecutiveFailures: number
  lastFailure: number | null
  cooldownUntil: number | null
}

export interface ProxyResult {
  agent: ProxyAgent
  proxyUrl: string // host:port for logging
  proxyId: string // Full URL for reporting results
}

export interface ProxyStats {
  total: number
  healthy: number
  inCooldown: number
  proxies: Array<{
    hostPort: string
    successes: number
    failures: number
    successRate: number
    inCooldown: boolean
    cooldownRemaining: number | null
  }>
}

// ============================================
// STATE (Module-level singleton)
// ============================================
let proxyList: ProxyEntry[] = []
let proxyListLoaded = false
let lastFileModTime = 0
const proxyHealth = new Map<string, ProxyHealth>()
const agentCache = new Map<string, ProxyAgent>()

// ============================================
// PROXY LIST LOADING
// ============================================
function getProxyFilePath(): string {
  return path.join(process.cwd(), 'src', 'proxies.txt')
}

function parseProxyLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  // Already in URL format
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('socks')) {
    return trimmed
  }

  // Parse webshare format: host:port:username:password
  const parts = trimmed.split(':')
  if (parts.length === 4) {
    const [host, port, username, password] = parts
    return `http://${username}:${password}@${host}:${port}`
  }

  // Invalid format
  return null
}

function extractHostPort(proxyUrl: string): string {
  const match = proxyUrl.match(/@([^:]+):(\d+)/)
  if (match) {
    return `${match[1]}:${match[2]}`
  }
  // Fallback: mask credentials
  return proxyUrl.replace(/:[^:@]+@/, ':****@')
}

function loadProxyList(): void {
  const filePath = getProxyFilePath()

  try {
    if (!fs.existsSync(filePath)) {
      console.warn('[Proxy] proxies.txt not found')
      proxyList = []
      proxyListLoaded = true
      return
    }

    const stats = fs.statSync(filePath)
    const modTime = stats.mtimeMs

    // Skip if file hasn't changed
    if (proxyListLoaded && modTime === lastFileModTime) {
      return
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    const newProxyList: ProxyEntry[] = []
    for (const line of lines) {
      const url = parseProxyLine(line)
      if (url) {
        newProxyList.push({
          url,
          hostPort: extractHostPort(url),
          agent: null, // Lazy creation
        })
      }
    }

    proxyList = newProxyList
    lastFileModTime = modTime
    proxyListLoaded = true

    console.log(`[Proxy] Loaded ${proxyList.length} proxies from file`)
  } catch (error) {
    console.error('[Proxy] Failed to load proxy list:', error)
    proxyList = []
    proxyListLoaded = true
  }
}

// Initialize on first import
loadProxyList()

// Set up file watcher for hot-reload (polling-based for reliability)
const proxyFilePath = getProxyFilePath()
if (fs.existsSync(proxyFilePath)) {
  fs.watchFile(proxyFilePath, { interval: 5000 }, () => {
    console.log('[Proxy] Detected proxies.txt change, reloading...')
    loadProxyList()
  })
}

// ============================================
// AGENT CREATION (Lazy & Cached)
// ============================================
function createAgent(proxyUrl: string): ProxyAgent {
  // Check cache first
  const cached = agentCache.get(proxyUrl)
  if (cached) return cached

  let agent: ProxyAgent

  if (proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
    agent = new SocksProxyAgent(proxyUrl)
  } else {
    // HTTP proxy to HTTPS target needs HttpsProxyAgent
    agent = new HttpsProxyAgent(proxyUrl)
  }

  agentCache.set(proxyUrl, agent)
  return agent
}

function getOrCreateAgent(entry: ProxyEntry): ProxyAgent {
  if (!entry.agent) {
    entry.agent = createAgent(entry.url)
  }
  return entry.agent
}

// ============================================
// HEALTH TRACKING
// ============================================
function getProxyHealth(proxyUrl: string): ProxyHealth {
  let health = proxyHealth.get(proxyUrl)
  if (!health) {
    health = {
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      lastFailure: null,
      cooldownUntil: null,
    }
    proxyHealth.set(proxyUrl, health)
  }
  return health
}

function isInCooldown(health: ProxyHealth): boolean {
  if (!health.cooldownUntil) return false
  if (Date.now() >= health.cooldownUntil) {
    // Cooldown expired - reset
    health.cooldownUntil = null
    health.consecutiveFailures = 0
    return false
  }
  return true
}

function calculateSuccessRate(health: ProxyHealth): number {
  const total = health.successes + health.failures
  if (total === 0) return 1 // New proxy gets benefit of doubt
  return health.successes / total
}

/**
 * Report a successful proxy request
 */
export function reportProxySuccess(proxyId: string): void {
  const health = getProxyHealth(proxyId)
  health.successes++
  health.consecutiveFailures = 0
  health.cooldownUntil = null
}

/**
 * Report a failed proxy request
 */
export function reportProxyFailure(proxyId: string): void {
  const health = getProxyHealth(proxyId)
  health.failures++
  health.consecutiveFailures++
  health.lastFailure = Date.now()

  // Trigger cooldown if enough consecutive failures
  if (health.consecutiveFailures >= CONSECUTIVE_FAILURES_FOR_COOLDOWN) {
    health.cooldownUntil = Date.now() + COOLDOWN_DURATION_MS
    const hostPort = extractHostPort(proxyId)
    console.log(`[Proxy] ${hostPort} entering ${COOLDOWN_DURATION_MS / 1000}s cooldown after ${health.consecutiveFailures} failures`)
  }
}

// ============================================
// PROXY SELECTION
// ============================================

/**
 * Get available proxies (not in cooldown)
 */
function getAvailableProxies(): ProxyEntry[] {
  // Ensure list is loaded
  if (!proxyListLoaded) loadProxyList()

  const now = Date.now()
  return proxyList.filter(entry => {
    const health = proxyHealth.get(entry.url)
    if (!health) return true // New proxy is available
    if (!health.cooldownUntil) return true
    if (now >= health.cooldownUntil) {
      // Cooldown expired
      health.cooldownUntil = null
      health.consecutiveFailures = 0
      return true
    }
    return false
  })
}

/**
 * Select a random proxy weighted by success rate
 */
function selectWeightedProxy(available: ProxyEntry[]): ProxyEntry {
  if (available.length === 0) {
    throw new Error('No proxies available')
  }

  if (available.length === 1) {
    return available[0]
  }

  // Calculate weights based on success rate
  const weights: number[] = available.map(entry => {
    const health = proxyHealth.get(entry.url)
    if (!health) return 1 // New proxy gets full weight
    const rate = calculateSuccessRate(health)
    // Ensure minimum weight so bad proxies still get occasional use
    return Math.max(rate, MIN_SUCCESS_RATE_WEIGHT)
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)

  // Weighted random selection
  let random = Math.random() * totalWeight
  for (let i = 0; i < available.length; i++) {
    random -= weights[i]
    if (random <= 0) {
      return available[i]
    }
  }

  // Fallback (shouldn't happen)
  return available[available.length - 1]
}

/**
 * Gets a random proxy agent with health-aware selection
 * @param _route Optional route name for logging purposes
 * @returns Object with proxy agent and identifiers, or null if no proxies
 */
export function getRandomProxy(_route?: string): ProxyResult | null {
  try {
    let available = getAvailableProxies()

    // If all proxies are in cooldown, use any proxy as fallback
    if (available.length === 0) {
      if (proxyList.length === 0) {
        console.warn('[Proxy] No proxies configured')
        return null
      }
      console.warn('[Proxy] All proxies in cooldown, using random fallback')
      available = proxyList
    }

    const selected = selectWeightedProxy(available)
    const agent = getOrCreateAgent(selected)

    return {
      agent,
      proxyUrl: selected.hostPort,
      proxyId: selected.url,
    }
  } catch (error) {
    console.error('[Proxy] Selection failed:', error)
    return null
  }
}

/**
 * Get multiple unique proxies for racing
 * @param count Number of proxies to get
 * @returns Array of proxy results (may be fewer if not enough available)
 */
export function getProxiesForRacing(count: number): ProxyResult[] {
  if (!proxyListLoaded) loadProxyList()

  let available = getAvailableProxies()

  // Fallback if all in cooldown
  if (available.length === 0 && proxyList.length > 0) {
    console.warn('[Proxy] All proxies in cooldown for racing, using all')
    available = proxyList
  }

  if (available.length === 0) {
    return []
  }

  // Shuffle and take up to count
  const shuffled = [...available].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(count, shuffled.length))

  return selected.map(entry => ({
    agent: getOrCreateAgent(entry),
    proxyUrl: entry.hostPort,
    proxyId: entry.url,
  }))
}

// ============================================
// STATS & MONITORING
// ============================================

/**
 * Get proxy statistics for monitoring
 */
export function getProxyStats(): ProxyStats {
  if (!proxyListLoaded) loadProxyList()

  const now = Date.now()
  let healthy = 0
  let inCooldown = 0

  const proxies = proxyList.map(entry => {
    const health = proxyHealth.get(entry.url)
    const isCooldown = health ? isInCooldown(health) : false

    if (isCooldown) {
      inCooldown++
    } else {
      healthy++
    }

    return {
      hostPort: entry.hostPort,
      successes: health?.successes ?? 0,
      failures: health?.failures ?? 0,
      successRate: health ? calculateSuccessRate(health) : 1,
      inCooldown: isCooldown,
      cooldownRemaining: isCooldown && health?.cooldownUntil
        ? Math.max(0, Math.round((health.cooldownUntil - now) / 1000))
        : null,
    }
  })

  return {
    total: proxyList.length,
    healthy,
    inCooldown,
    proxies,
  }
}

/**
 * Force reload proxy list (useful after manual edits)
 */
export function reloadProxyList(): void {
  lastFileModTime = 0 // Force reload
  loadProxyList()
}

/**
 * Clear all health data (reset cooldowns and stats)
 */
export function clearProxyHealth(): void {
  proxyHealth.clear()
  console.log('[Proxy] Health data cleared')
}

// ============================================
// LEGACY COMPATIBILITY
// ============================================

/**
 * @deprecated Use getRandomProxy() which returns proxyId for reporting
 */
export function getProxyList(): string[] {
  if (!proxyListLoaded) loadProxyList()
  return proxyList.map(p => p.url)
}

// ============================================
// PROXY SESSIONS
// Maintains consistent proxy identity for CDN token validation.
// CDN tokens (ipa=1) are tied to the IP that fetched the video metadata.
// Segment fetches must use the SAME proxy to match the token's IP.
// ============================================
const PROXY_SESSION_TTL = 4 * 60 * 60 * 1000
const proxySessionStore = new Map<string, { proxyUrl: string, createdAt: number }>()

export function createProxySession(proxyUrl: string): string {
  if (proxySessionStore.size >= 2000) {
    const now = Date.now()
    for (const [id, s] of proxySessionStore) {
      if (now - s.createdAt > PROXY_SESSION_TTL) proxySessionStore.delete(id)
    }
  }
  const id = Math.random().toString(36).slice(2, 10)
  proxySessionStore.set(id, { proxyUrl, createdAt: Date.now() })
  return id
}

export function getSessionAgent(sessionId: string): ProxyAgent | null {
  const session = proxySessionStore.get(sessionId)
  if (!session) return null
  if (Date.now() - session.createdAt > PROXY_SESSION_TTL) {
    proxySessionStore.delete(sessionId)
    return null
  }
  return createAgent(session.proxyUrl)
}

// Periodic health decay (prevent stale data from dominating)
setInterval(() => {
  for (const health of proxyHealth.values()) {
    // Decay old stats by 10% every interval
    health.successes = Math.floor(health.successes * 0.9)
    health.failures = Math.floor(health.failures * 0.9)
  }
}, HEALTH_DECAY_INTERVAL_MS)
