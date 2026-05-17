// ─────────────────────────────────────────────────────────────
// HSM Scrapers — Bright Data Proxy Manager
// Rotating residential proxies to avoid scraper bans
// ─────────────────────────────────────────────────────────────

import { logScraperEvent } from '../utils/types';

const BD_HOST     = process.env.BRIGHTDATA_HOST     ?? 'brd.superproxy.io';
const BD_USER     = process.env.BRIGHTDATA_USERNAME  ?? '';
const BD_PASS     = process.env.BRIGHTDATA_PASSWORD  ?? '';
const BD_PORT     = 22225;

// ─────────────────────────────────────────────────────────────
// Proxy health tracker (in-memory, resets on restart)
// ─────────────────────────────────────────────────────────────
interface ProxyStats {
  requests:  number;
  blocked:   number;
  lastUsed:  number;
}

const proxyStats: Record<string, ProxyStats> = {};
let totalRequests = 0;
let totalBlocked  = 0;

// ─────────────────────────────────────────────────────────────
// Get a proxy config for Playwright
// Bright Data auto-rotates IPs on each connection
// ─────────────────────────────────────────────────────────────
export function getProxyConfig(sessionId?: string): {
  server:   string;
  username: string;
  password: string;
} {
  // Each unique session ID = a dedicated IP session
  // Rotating session = new IP on every request
  const session = sessionId ?? `session_${Math.random().toString(36).slice(2, 9)}`;
  const username = `${BD_USER}-session-${session}`;

  return {
    server:   `http://${BD_HOST}:${BD_PORT}`,
    username,
    password: BD_PASS,
  };
}

// ─────────────────────────────────────────────────────────────
// Get a new rotating proxy (new IP every call)
// ─────────────────────────────────────────────────────────────
export function getRotatingProxy() {
  return getProxyConfig(`rotate_${Date.now()}`);
}

// ─────────────────────────────────────────────────────────────
// Record a block/ban event from a scraper
// ─────────────────────────────────────────────────────────────
export async function recordBlock(scraperName: string): Promise<void> {
  totalBlocked++;
  if (!proxyStats[scraperName]) {
    proxyStats[scraperName] = { requests: 0, blocked: 0, lastUsed: Date.now() };
  }
  proxyStats[scraperName].blocked++;

  const blockRate = getBanRiskPercent();
  console.warn(`[ProxyManager] Block recorded for ${scraperName} — overall ban risk: ${blockRate}%`);

  // Alert if ban risk > 60%
  if (blockRate > 60) {
    await logScraperEvent('warn', scraperName,
      `High ban risk detected: ${blockRate}% block rate`,
      { blockRate, totalBlocked, totalRequests },
    );
  }

  if (blockRate > 85) {
    await logScraperEvent('critical', scraperName,
      `CRITICAL ban risk: ${blockRate}% — scrapers may be compromised`,
      { blockRate },
    );
  }
}

export function recordRequest(scraperName: string): void {
  totalRequests++;
  if (!proxyStats[scraperName]) {
    proxyStats[scraperName] = { requests: 0, blocked: 0, lastUsed: Date.now() };
  }
  proxyStats[scraperName].requests++;
  proxyStats[scraperName].lastUsed = Date.now();
}

// ─────────────────────────────────────────────────────────────
// Ban risk meter (0-100) — read by admin panel
// ─────────────────────────────────────────────────────────────
export function getBanRiskPercent(): number {
  if (totalRequests === 0) return 0;
  return Math.round((totalBlocked / totalRequests) * 100);
}

export function getProxyHealthReport() {
  return {
    totalRequests,
    totalBlocked,
    banRiskPercent: getBanRiskPercent(),
    perScraper:     proxyStats,
  };
}
