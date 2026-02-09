import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://kgramjutjldqiabjzrih.supabase.co';
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    '';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DIST_PATH = path.join(__dirname, '..', 'dist');
const HAS_DIST = fs.existsSync(DIST_PATH);

// Trust proxy for production
app.set('trust proxy', true);

// =====================
// SECURITY MIDDLEWARE
// =====================

// =====================
// SECURITY MIDDLEWARE
// =====================

// Input validation helpers
const validateUsername = (username) => {
    if (!username || typeof username !== 'string') return false;
    return username.length >= 3 && username.length <= 50;
};

const validatePassword = (password) => {
    if (!password || typeof password !== 'string') return false;
    return password.length >= 8;
};

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validateUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
        return true;
    } catch {
        return false;
    }
};

// Input sanitization helpers
const sanitizeString = (str, maxLength = 500) => {
    if (typeof str !== 'string') return '';
    return str.substring(0, maxLength).trim();
};

// Storage configuration (Redis + in-memory fallback)
const REDIS_URL = process.env.REDIS_URL || '';
const REDIS_ENABLED = Boolean(REDIS_URL);
const SESSION_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE || 'admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.COOKIE_SECRET || 'dev-session-secret-change-me';
const SESSION_COOKIE_SECURE = (process.env.SESSION_COOKIE_SECURE || '').toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
const CONTENT_HISTORY_LIMIT = Math.max(10, parseInt(process.env.CONTENT_HISTORY_LIMIT || '40', 10));
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_VIOLATION_WINDOW_MS = 10 * 60 * 1000;
const TEMP_BLOCK_DURATION_MS = 20 * 60 * 1000;
const RATE_LIMIT_BLOCK_THRESHOLD = 6;
const MALICIOUS_INPUT_BLOCK_THRESHOLD = 3;
const GEO_CACHE_TTL_MS = 30 * 60 * 1000;
const APPEAL_MIN_INTERVAL_MS = 2 * 60 * 1000;
const BLOCKED_IPS = new Map();
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 min
const LOGIN_LOCK_THRESHOLD = 5;

const memoryRateLimitStore = new Map();
const memorySessionStore = new Map();
const memoryLoginAttempts = new Map();
const memoryRateLimitViolations = new Map();
const memoryMaliciousInputAttempts = new Map();
const memoryAppealSubmissions = new Map();
const geoDataCache = new Map();
let redisClient = null;
let redisConnected = false;
let redisStatus = REDIS_ENABLED ? 'connecting' : 'disabled';
let analyticsCache = { timestamp: 0, key: '', visits: [] };

if (REDIS_ENABLED) {
    redisClient = createRedisClient({ url: REDIS_URL });
    redisClient.on('error', (error) => {
        redisConnected = false;
        redisStatus = 'error';
        console.warn('Redis error:', error.message);
    });
    redisClient.on('ready', () => {
        redisConnected = true;
        redisStatus = 'connected';
        console.log('Redis connected.');
    });
    redisClient.connect().catch((error) => {
        redisConnected = false;
        redisStatus = 'fallback-memory';
        console.warn('Redis connection failed, using in-memory fallback:', error.message);
    });
}

const getRedis = () => (redisConnected && redisClient ? redisClient : null);
const getRateLimitKey = (key) => `rl:${key}`;
const getSessionKey = (sessionId) => `session:${sessionId}`;
const getLoginAttemptKey = (key) => `login_attempt:${key}`;

const RATE_LIMIT_RULES = [
    { name: 'login', match: (req) => req.path === '/api/login', max: 10 },
    { name: 'appeal', match: (req) => req.path.startsWith('/api/security/appeal'), max: 30 },
    { name: 'settings', match: (req) => req.path.startsWith('/api/settings'), max: 20 },
    { name: 'admin_write', match: (req) => req.path.startsWith('/api/content') || req.path.startsWith('/api/upload') || req.path.startsWith('/api/notifications'), max: 80 },
    { name: 'tracking', match: (req) => req.path.startsWith('/api/track'), max: 240 },
    { name: 'default', match: () => true, max: 140 }
];

const SECURITY_PATTERNS = [
    // XSS - Only match actual script tags, not URLs
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    // More specific javascript: check - only in onclick, onerror, etc attributes
    /on\w+\s*=\s*['"]*javascript:/gi,
    // Path Traversal 
    /(\.\.\/|\.\.\\)/g
];

const SQL_INJECTION_PATTERNS = [
    /\bunion\b[\s\S]{0,40}\bselect\b/i,
    /\bselect\b[\s\S]{0,40}\bfrom\b/i,
    /\b(insert|update|delete|drop|truncate|alter)\b[\s\S]{0,40}\b(table|into|set)\b/i,
    /\b(or|and)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
    /\b(sleep|benchmark)\s*\(/i,
    /--\s*$/m
];

const COMMAND_INJECTION_PATTERNS = [
    /(?:^|[\s;&|`])(?:cat|ls|pwd|bash|sh|cmd|powershell|wget|curl|nc|ncat)\b/i,
    /\|\s*(?:bash|sh|powershell|cmd)\b/i
];

const NOSQL_OPERATOR_KEYS = new Set([
    '$where', '$ne', '$gt', '$gte', '$lt', '$lte', '$regex', '$or', '$and', '$nor', '$not', '$expr',
    '__proto__', 'prototype', 'constructor'
]);

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://ip-api.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none';"
    );
    next();
});

const registerIncident = (store, ip, windowMs) => {
    const now = Date.now();
    const existing = store.get(ip);
    if (!existing || (now - existing.firstSeenAt) > windowMs) {
        store.set(ip, { count: 1, firstSeenAt: now, lastSeenAt: now });
        return 1;
    }

    const updated = { ...existing, count: existing.count + 1, lastSeenAt: now };
    store.set(ip, updated);
    return updated.count;
};

const persistBlockedIp = (ip, payload) => {
    try {
        const db = readDB();
        if (!db.security || typeof db.security !== 'object') db.security = { blockedIps: {}, appeals: [] };
        if (!db.security.blockedIps || typeof db.security.blockedIps !== 'object') db.security.blockedIps = {};
        db.security.blockedIps[ip] = payload;
        writeDB(db);
    } catch (error) {
        console.warn('Failed to persist blocked IP state:', error.message);
    }
};

const removePersistedBlockedIp = (ip) => {
    try {
        const db = readDB();
        if (!db.security?.blockedIps?.[ip]) return;
        delete db.security.blockedIps[ip];
        writeDB(db);
    } catch (error) {
        console.warn('Failed to remove persisted blocked IP state:', error.message);
    }
};

const blockIpTemporarily = (ip, durationMs = TEMP_BLOCK_DURATION_MS, reason = 'Suspicious traffic detected') => {
    const blockedUntil = Date.now() + durationMs;
    const payload = {
        blockedUntil,
        reason,
        source: 'auto',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    BLOCKED_IPS.set(ip, payload);
    persistBlockedIp(ip, payload);
    return payload;
};

const unblockIp = (ip) => {
    BLOCKED_IPS.delete(ip);
    removePersistedBlockedIp(ip);
};

const getIpBlockStatus = (ip) => {
    const payload = BLOCKED_IPS.get(ip);
    if (!payload) return { blocked: false, remainingMs: 0, reason: null, blockedUntil: null };
    const blockedUntil = typeof payload === 'number' ? payload : Number(payload.blockedUntil);
    if (!blockedUntil || blockedUntil <= Date.now()) {
        unblockIp(ip);
        return { blocked: false, remainingMs: 0 };
    }
    const reason = typeof payload === 'number' ? 'Security policy triggered' : (payload.reason || 'Security policy triggered');
    return { blocked: true, remainingMs: blockedUntil - Date.now(), blockedUntil, reason };
};

const isLocalOrPrivateIp = (ip = '') => {
    if (!ip) return true;
    const normalized = ip.replace('::ffff:', '').trim();
    return normalized === '::1'
        || normalized === '127.0.0.1'
        || normalized === 'localhost'
        || normalized.startsWith('10.')
        || normalized.startsWith('192.168.')
        || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized)
        || normalized.startsWith('fc')
        || normalized.startsWith('fd');
};

const getGeoDataCached = async (ip) => {
    if (!ip || isLocalOrPrivateIp(ip)) return null;

    const cached = geoDataCache.get(ip);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    const geo = await fetchGeoData(ip);
    geoDataCache.set(ip, { value: geo, expiresAt: now + GEO_CACHE_TTL_MS });
    return geo;
};

const buildAttackGeoSummary = (geo) => {
    if (!geo) return null;
    return `Geo: ${geo.city || 'Unknown'}, ${geo.country || 'Unknown'} | Region: ${geo.region || 'Unknown'} | ISP: ${geo.isp || 'Unknown'} | VPN: ${geo.isVpn ? 'yes' : 'no'} | Connection: ${geo.connectionType || 'unknown'}`;
};

const logAttackNotification = async ({ type = 'attack_blocked', title, message, ip }) => {
    try {
        const geo = await getGeoDataCached(ip);
        const geoSummary = buildAttackGeoSummary(geo);
        const finalMessage = geoSummary ? `${message} | ${geoSummary}` : message;
        logNotification(type, title, sanitizeString(finalMessage, 450), ip || null);
    } catch (error) {
        logNotification(type, title, sanitizeString(message, 450), ip || null);
    }
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderBlockedPage = ({ reason, blockedUntil, remainingMs }) => {
    const safeReason = escapeHtml(reason || 'Suspicious traffic was detected from your network.');
    const blockedUntilIso = new Date(blockedUntil || Date.now()).toISOString();
    const remainingSeconds = Math.max(1, Math.ceil((remainingMs || 0) / 1000));

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access Temporarily Blocked</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Segoe UI', Arial, sans-serif;
      background: radial-gradient(circle at 20% 0%, #123c4a 0%, #020c1b 55%);
      color: #dbe7f3;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(92vw, 700px);
      background: rgba(7, 19, 34, 0.92);
      border: 1px solid rgba(100, 255, 218, 0.28);
      border-radius: 22px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      padding: 28px;
      backdrop-filter: blur(10px);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(0, 243, 255, 0.45);
      border-radius: 999px;
      padding: 8px 14px;
      color: #8ff3ff;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 { margin: 14px 0 8px; font-size: 30px; line-height: 1.15; }
    p { color: #9fb2c7; margin: 0 0 10px; }
    .reason {
      margin-top: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.02);
      padding: 12px;
      color: #f5fbff;
    }
    .timer {
      margin-top: 12px;
      font-size: 14px;
      color: #64ffda;
      font-weight: 700;
    }
    form {
      margin-top: 20px;
      display: grid;
      gap: 10px;
    }
    textarea, input {
      width: 100%;
      background: rgba(2, 12, 27, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e7f3ff;
      border-radius: 12px;
      padding: 12px;
      outline: none;
      font-size: 14px;
      box-sizing: border-box;
    }
    textarea:focus, input:focus { border-color: rgba(100, 255, 218, 0.8); }
    button {
      border: 1px solid rgba(0, 243, 255, 0.4);
      background: linear-gradient(120deg, rgba(0, 243, 255, 0.2), rgba(100, 255, 218, 0.2));
      color: #ccfcff;
      font-weight: 700;
      border-radius: 12px;
      padding: 12px 14px;
      cursor: pointer;
      transition: transform .15s ease, box-shadow .2s ease, opacity .2s ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0, 243, 255, 0.18); }
    button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
    .msg { min-height: 20px; font-size: 13px; }
    .ok { color: #6ef0c3; }
    .err { color: #ff8a8a; }
  </style>
</head>
<body>
  <section class="card">
    <span class="pill">Security Protection Active</span>
    <h1>Access Temporarily Blocked</h1>
    <p>Your IP has been temporarily blocked to protect this website.</p>
    <div class="reason"><strong>Reason:</strong> ${safeReason}</div>
    <div class="timer" id="timer" data-remaining="${remainingSeconds}" data-until="${blockedUntilIso}"></div>

    <form id="appeal-form">
      <textarea id="appeal-message" rows="4" maxlength="450" placeholder="Explain why this block should be removed..." required></textarea>
      <input id="appeal-contact" type="text" maxlength="120" placeholder="Optional contact (email/username)" />
      <button id="appeal-submit" type="submit">Submit Unban Request</button>
      <div id="appeal-result" class="msg"></div>
    </form>
  </section>
  <script>
    (function () {
      const timerEl = document.getElementById('timer');
      const until = new Date(timerEl.dataset.until).getTime();
      const tick = () => {
        const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        const min = Math.floor(left / 60);
        const sec = left % 60;
        timerEl.textContent = left > 0 ? ('Estimated unblock in ' + min + 'm ' + sec + 's') : 'Block should expire soon. Please refresh.';
      };
      tick();
      setInterval(tick, 1000);

      const form = document.getElementById('appeal-form');
      const submit = document.getElementById('appeal-submit');
      const result = document.getElementById('appeal-result');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        result.textContent = '';
        result.className = 'msg';
        submit.disabled = true;
        try {
          const payload = {
            message: document.getElementById('appeal-message').value.trim(),
            contact: document.getElementById('appeal-contact').value.trim()
          };
          const res = await fetch('/api/security/appeal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit appeal');
          result.textContent = 'Appeal submitted. Admin will review your request.';
          result.classList.add('ok');
          form.reset();
        } catch (error) {
          result.textContent = error.message || 'Appeal failed. Please retry.';
          result.classList.add('err');
        } finally {
          submit.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
};

const appendRateLimitHit = async (key, windowMs) => {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redis = getRedis();
    if (redis) {
        const redisKey = getRateLimitKey(key);
        await redis.zRemRangeByScore(redisKey, 0, windowStart);
        await redis.zAdd(redisKey, [{ score: now, value: `${now}-${crypto.randomUUID()}` }]);
        await redis.pExpire(redisKey, windowMs + 5000);
        return redis.zCard(redisKey);
    }

    const requests = (memoryRateLimitStore.get(key) || []).filter((time) => time > windowStart);
    requests.push(now);
    memoryRateLimitStore.set(key, requests);
    return requests.length;
};

const createSession = async (payload = {}) => {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
    const sessionData = { ...payload, expiresAt };
    const redis = getRedis();

    if (redis) {
        await redis.set(getSessionKey(sessionId), JSON.stringify(sessionData), { PX: ADMIN_SESSION_TTL_MS });
    } else {
        memorySessionStore.set(sessionId, sessionData);
    }

    return { sessionId, expiresAt };
};

const getSessionData = async (sessionId) => {
    if (!sessionId) return null;
    const redis = getRedis();
    if (redis) {
        const raw = await redis.get(getSessionKey(sessionId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || parsed.expiresAt < Date.now()) {
            await redis.del(getSessionKey(sessionId));
            return null;
        }
        return parsed;
    }

    const local = memorySessionStore.get(sessionId);
    if (!local) return null;
    if (!local.expiresAt || local.expiresAt < Date.now()) {
        memorySessionStore.delete(sessionId);
        return null;
    }
    return local;
};

const deleteSession = async (sessionId) => {
    if (!sessionId) return;
    const redis = getRedis();
    if (redis) {
        await redis.del(getSessionKey(sessionId));
        return;
    }
    memorySessionStore.delete(sessionId);
};

const getLoginAttemptState = async (key) => {
    const redis = getRedis();
    if (redis) {
        const raw = await redis.get(getLoginAttemptKey(key));
        return raw ? JSON.parse(raw) : null;
    }
    return memoryLoginAttempts.get(key) || null;
};

const setLoginAttemptState = async (key, state) => {
    const redis = getRedis();
    const ttlMs = LOGIN_LOCK_WINDOW_MS + LOGIN_LOCK_DURATION_MS;
    if (redis) {
        await redis.set(getLoginAttemptKey(key), JSON.stringify(state), { PX: ttlMs });
        return;
    }
    memoryLoginAttempts.set(key, state);
};

const clearLoginAttemptState = async (key) => {
    const redis = getRedis();
    if (redis) {
        await redis.del(getLoginAttemptKey(key));
        return;
    }
    memoryLoginAttempts.delete(key);
};

const getLoginBackoffMs = (failedAttempts) => {
    if (failedAttempts <= 1) return 0;
    return Math.min(10000, (failedAttempts - 1) * 1000);
};

// Rate limiter
const rateLimiter = async (req, res, next) => {
    const ip = getClientIP(req);
    const blockStatus = getIpBlockStatus(ip);
    const isSecurityAppealRoute = req.path === '/api/security/appeal' || req.path === '/api/security/block-status';

    if (blockStatus.blocked) {
        if (isSecurityAppealRoute) {
            return next();
        }

        const remainingMinutes = Math.max(1, Math.ceil(blockStatus.remainingMs / (60 * 1000)));
        void logAttackNotification({
            type: 'attack_blocked',
            title: 'Blocked IP Attempt',
            message: `Blocked request from temporarily banned IP. reason="${blockStatus.reason || 'security policy'}", remaining=${remainingMinutes} minute(s).`,
            ip
        });

        if (req.path.startsWith('/api/')) {
            return res.status(403).json({
                blocked: true,
                error: 'Access denied. IP temporarily blocked due to abusive traffic.',
                reason: blockStatus.reason || 'Security policy triggered',
                blockedUntil: blockStatus.blockedUntil || null,
                remainingSeconds: Math.max(1, Math.ceil(blockStatus.remainingMs / 1000))
            });
        }

        return res.status(403).type('html').send(renderBlockedPage({
            reason: blockStatus.reason,
            blockedUntil: blockStatus.blockedUntil,
            remainingMs: blockStatus.remainingMs
        }));
    }

    const matchedRule = RATE_LIMIT_RULES.find((rule) => rule.match(req)) || RATE_LIMIT_RULES[RATE_LIMIT_RULES.length - 1];
    const key = `${ip}:${matchedRule.name}`;
    let requestCount = 0;
    try {
        requestCount = await appendRateLimitHit(key, RATE_LIMIT_WINDOW);
    } catch (error) {
        console.warn('Rate limiter storage failed, request allowed:', error.message);
        return next();
    }

    if (requestCount > matchedRule.max) {
        const violationCount = registerIncident(memoryRateLimitViolations, ip, RATE_LIMIT_VIOLATION_WINDOW_MS);
        if (violationCount >= RATE_LIMIT_BLOCK_THRESHOLD) {
            const blockPayload = blockIpTemporarily(ip, TEMP_BLOCK_DURATION_MS, 'Repeated rate-limit violations / possible DoS pattern');
            void logAttackNotification({
                type: 'attack_blocked',
                title: 'IP Auto-Blocked (DoS Protection)',
                message: `IP exceeded rate limit repeatedly. Rule=${matchedRule.name}, requests=${requestCount}, violations=${violationCount}, blockedUntil=${new Date(blockPayload.blockedUntil).toISOString()}`,
                ip
            });
            return res.status(429).json({ error: 'Too many requests. IP temporarily blocked due to repeated abuse.' });
        }

        void logAttackNotification({
            type: 'attack_blocked',
            title: 'Rate Limit Exceeded',
            message: `IP exceeded rate limit for rule=${matchedRule.name}. requests=${requestCount}, violations=${violationCount}/${RATE_LIMIT_BLOCK_THRESHOLD}`,
            ip
        });
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    next();
};

// Input sanitizer - Smart version that allows common content
const sanitizeInput = (req, res, next) => {
    const ip = getClientIP(req);

    // Skip heavy binary-like payloads and tracking endpoints.
    const skipPrefixes = ['/api/track', '/api/upload/header-icon', '/api/content', '/api/security/appeal', '/api/security/block-status'];
    if (skipPrefixes.some((prefix) => req.path.startsWith(prefix))) {
        return next();
    }

    let detection = null;

    const checkString = (str, path) => {
        if (typeof str !== 'string') return false;
        const findMatch = (patterns, label) => patterns.find((pattern) => {
            const isMatch = pattern.test(str);
            if (pattern.global) pattern.lastIndex = 0;
            if (isMatch) {
                detection = { label, path, value: str.slice(0, 220) };
            }
            return isMatch;
        });

        if (findMatch(SECURITY_PATTERNS, 'xss_or_path_traversal')) return true;
        if (findMatch(SQL_INJECTION_PATTERNS, 'sql_injection')) return true;
        if (findMatch(COMMAND_INJECTION_PATTERNS, 'command_injection')) return true;
        return false;
    };

    const checkObject = (obj, path = '') => {
        if (!obj || typeof obj !== 'object') return false;
        for (const key in obj) {
            if (NOSQL_OPERATOR_KEYS.has(key)) {
                detection = { label: 'nosql_or_prototype_pollution', path: path ? `${path}.${key}` : key, value: key };
                return true;
            }
            const value = obj[key];
            const currentPath = path ? `${path}.${key}` : key;
            if (typeof value === 'string' && checkString(value, currentPath)) {
                return true;
            }
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i += 1) {
                    const currentItemPath = `${currentPath}[${i}]`;
                    if (typeof value[i] === 'string' && checkString(value[i], currentItemPath)) {
                        return true;
                    }
                    if (typeof value[i] === 'object' && value[i] !== null && checkObject(value[i], currentItemPath)) {
                        return true;
                    }
                }
            }
            if (typeof value === 'object' && value !== null) {
                if (checkObject(value, currentPath)) return true;
            }
        }
        return false;
    };

    if (checkObject(req.body, 'body') || checkObject(req.query, 'query')) {
        const attempts = registerIncident(memoryMaliciousInputAttempts, ip, RATE_LIMIT_VIOLATION_WINDOW_MS);
        const message = `Suspicious payload blocked. type=${detection?.label || 'unknown'}, path=${detection?.path || 'n/a'}, attempts=${attempts}`;
        void logAttackNotification({
            type: 'attack_blocked',
            title: 'Malicious Input Blocked',
            message,
            ip
        });

        if (attempts >= MALICIOUS_INPUT_BLOCK_THRESHOLD) {
            const blockPayload = blockIpTemporarily(ip, TEMP_BLOCK_DURATION_MS, 'Repeated malicious payloads (injection defense)');
            void logAttackNotification({
                type: 'attack_blocked',
                title: 'IP Auto-Blocked (Injection Defense)',
                message: `Repeated malicious payloads detected. blockedUntil=${new Date(blockPayload.blockedUntil).toISOString()}`,
                ip
            });
            return res.status(403).json({ error: 'Request blocked due to repeated malicious input attempts.' });
        }

        return res.status(400).json({ error: 'Invalid input detected. Request blocked by security policy.' });
    }

    next();
};

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

app.use(cookieParser(SESSION_SECRET));
app.use(bodyParser.json({ limit: '12mb' }));
app.use(rateLimiter);
app.use(sanitizeInput);

// Serve static files from the React build
if (HAS_DIST) {
    app.use(express.static(DIST_PATH));
}

// Helper to read/write local DB
const readDB = () => {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
        return {
            auth: {},
            content: {},
            contentHistory: [],
            analytics: { visits: [], reelClicks: {}, sessionDurations: {}, profileOverrides: {}, clearedAt: null },
            notifications: [],
            security: {
                blockedIps: {},
                appeals: []
            }
        };
    }
};
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Initialize notifications array if not exists
const initializeDB = () => {
    const db = readDB();
    if (!db.notifications) db.notifications = [];
    if (!db.analytics) db.analytics = { visits: [], reelClicks: {} };
    if (!db.analytics.reelClicks) db.analytics.reelClicks = {};
    if (!db.analytics.visits) db.analytics.visits = [];
    if (!db.analytics.sessionDurations || typeof db.analytics.sessionDurations !== 'object') db.analytics.sessionDurations = {};
    if (!db.analytics.profileOverrides || typeof db.analytics.profileOverrides !== 'object') db.analytics.profileOverrides = {};
    if (!db.analytics.clearedAt) db.analytics.clearedAt = null;
    if (!Array.isArray(db.contentHistory)) db.contentHistory = [];
    if (!db.security || typeof db.security !== 'object') db.security = { blockedIps: {}, appeals: [] };
    if (!db.security.blockedIps || typeof db.security.blockedIps !== 'object') db.security.blockedIps = {};
    if (!Array.isArray(db.security.appeals)) db.security.appeals = [];
    writeDB(db);
};
initializeDB();

const hydrateBlockedIpsFromDb = () => {
    try {
        const db = readDB();
        const blockedIps = db.security?.blockedIps || {};
        const now = Date.now();
        let mutated = false;

        Object.entries(blockedIps).forEach(([ip, payload]) => {
            const blockedUntil = Number(payload?.blockedUntil || 0);
            if (!blockedUntil || blockedUntil <= now) {
                delete blockedIps[ip];
                mutated = true;
                return;
            }
            BLOCKED_IPS.set(ip, {
                blockedUntil,
                reason: payload?.reason || 'Security policy triggered',
                source: payload?.source || 'persisted',
                createdAt: payload?.createdAt || new Date(now).toISOString(),
                updatedAt: payload?.updatedAt || new Date(now).toISOString()
            });
        });

        if (mutated) {
            db.security.blockedIps = blockedIps;
            writeDB(db);
        }
    } catch (error) {
        console.warn('Failed to hydrate blocked IPs from DB:', error.message);
    }
};
hydrateBlockedIpsFromDb();

// Log notification helper
const logNotification = (type, title, message, ip = null, metadata = null) => {
    try {
        const db = readDB();
        if (!db.notifications) db.notifications = [];

        const notification = {
            id: crypto.randomUUID(),
            type,
            title,
            message,
            ip,
            metadata,
            timestamp: new Date().toISOString(),
            read: false
        };

        db.notifications.unshift(notification);
        // Keep only last 500 notifications
        if (db.notifications.length > 500) {
            db.notifications = db.notifications.slice(0, 500);
        }
        writeDB(db);
    } catch (err) {
        console.error('Failed to log notification:', err);
    }
};

const reportServerError = (title, error, req = null) => {
    const message = error instanceof Error ? `${error.message}${error.stack ? ` | ${error.stack.split('\n')[1]?.trim() || ''}` : ''}` : String(error);
    logNotification('error', title, sanitizeString(message, 450), req ? getClientIP(req) : null);
};

// Get real client IP
const getClientIP = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIP = req.headers['x-real-ip'];
    if (realIP) return realIP;
    const cfIP = req.headers['cf-connecting-ip'];
    if (cfIP) return cfIP;
    return req.ip || req.socket?.remoteAddress || 'Unknown';
};

const GEO_FALLBACK = {
    country: 'Unknown',
    city: 'Unknown',
    region: 'Unknown',
    latitude: 0,
    longitude: 0,
    isp: 'Unknown',
    isVpn: false,
    connectionType: 'unknown',
    timezone: 'Unknown',
    isCrawler: false,
    source: 'fallback'
};

const fetchJsonWithTimeout = async (url, timeoutMs = 4500) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
};

const normalizeGeoData = (payload = {}) => ({
    country: payload.country || GEO_FALLBACK.country,
    city: payload.city || GEO_FALLBACK.city,
    region: payload.region || GEO_FALLBACK.region,
    latitude: Number(payload.latitude ?? payload.lat ?? GEO_FALLBACK.latitude) || 0,
    longitude: Number(payload.longitude ?? payload.lon ?? GEO_FALLBACK.longitude) || 0,
    isp: payload.isp || GEO_FALLBACK.isp,
    isVpn: Boolean(payload.isVpn),
    connectionType: payload.connectionType || GEO_FALLBACK.connectionType,
    timezone: payload.timezone || GEO_FALLBACK.timezone,
    isCrawler: Boolean(payload.isCrawler),
    source: payload.source || GEO_FALLBACK.source
});

const fetchGeoFromIpapiis = async (ip) => {
    const data = await fetchJsonWithTimeout(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`);
    if (!data || data.is_bogon) {
        throw new Error('Bogon or invalid response');
    }
    return normalizeGeoData({
        country: data.location?.country,
        city: data.location?.city,
        region: data.location?.state,
        latitude: data.location?.latitude,
        longitude: data.location?.longitude,
        isp: data.company?.name || data.asn?.org,
        isVpn: Boolean(data.is_vpn || data.is_proxy || data.is_tor),
        connectionType: data.is_mobile ? 'cellular' : (data.is_datacenter ? 'datacenter' : 'wifi'),
        timezone: data.location?.timezone,
        isCrawler: Boolean(data.is_crawler),
        source: 'ipapi.is'
    });
};

const fetchGeoFromIpApi = async (ip) => {
    const data = await fetchJsonWithTimeout(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,city,regionName,lat,lon,isp,mobile,proxy,hosting,timezone,query`);
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'ip-api lookup failed');
    }
    return normalizeGeoData({
        country: data.country,
        city: data.city,
        region: data.regionName,
        latitude: data.lat,
        longitude: data.lon,
        isp: data.isp,
        isVpn: Boolean(data.proxy || data.hosting),
        connectionType: data.mobile ? 'cellular' : 'wifi',
        timezone: data.timezone,
        source: 'ip-api'
    });
};

const fetchGeoFromIpwhois = async (ip) => {
    const data = await fetchJsonWithTimeout(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!data || data.success === false) {
        throw new Error(data?.message || 'ipwho.is lookup failed');
    }
    return normalizeGeoData({
        country: data.country,
        city: data.city,
        region: data.region,
        latitude: data.latitude,
        longitude: data.longitude,
        isp: data.connection?.isp || data.connection?.org,
        isVpn: Boolean(data.security?.vpn || data.security?.proxy || data.security?.tor),
        connectionType: data.connection?.type || 'unknown',
        timezone: data.timezone?.id,
        source: 'ipwho.is'
    });
};

const GEO_PROVIDERS = [
    fetchGeoFromIpapiis,
    fetchGeoFromIpApi,
    fetchGeoFromIpwhois
];

// Fetch geolocation
const fetchGeoData = async (ip) => {
    if (isLocalOrPrivateIp(ip)) {
        return {
            country: 'Localhost',
            city: 'Development Machine',
            region: 'Local',
            latitude: 0,
            longitude: 0,
            isp: 'Localhost',
            isVpn: false,
            connectionType: 'ethernet',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            isCrawler: false,
            source: 'local'
        };
    }

    for (const provider of GEO_PROVIDERS) {
        try {
            const result = await provider(ip);
            if (result && result.country && result.country !== 'Unknown') {
                return result;
            }
        } catch (error) {
            console.warn(`Geo provider failed (${provider.name}):`, error.message);
        }
    }

    return { ...GEO_FALLBACK };
};

const getDeviceType = (userAgent) => {
    if (!userAgent) return 'unknown';
    if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) return 'mobile';
    return 'desktop';
};

const BOT_NAME_PATTERNS = [
    ['Googlebot', /googlebot/i],
    ['Bingbot', /bingbot|bingpreview/i],
    ['YandexBot', /yandex(bot)?/i],
    ['DuckDuckBot', /duckduckbot/i],
    ['Baiduspider', /baiduspider/i],
    ['SemrushBot', /semrushbot/i],
    ['AhrefsBot', /ahrefsbot/i],
    ['Applebot', /applebot/i],
    ['Meta Bot', /facebookexternalhit|facebot/i],
    ['Twitter Bot', /twitterbot/i],
    ['Telegram Bot', /telegrambot/i],
    ['Discord Bot', /discordbot/i],
    ['Crawler', /\b(bot|crawler|spider|crawl|slurp)\b/i],
    ['Scripted Client', /\b(curl|wget|python-requests|axios|scrapy|httpclient)\b/i]
];

const detectBotFromUserAgent = (userAgent = '') => {
    const normalized = String(userAgent || '').trim();
    if (!normalized) {
        return {
            isBot: false,
            botName: null,
            reason: 'user-agent-empty',
            confidence: 0.1
        };
    }

    for (const [botName, pattern] of BOT_NAME_PATTERNS) {
        if (pattern.test(normalized)) {
            return {
                isBot: true,
                botName,
                reason: `ua-match:${botName}`,
                confidence: 0.86
            };
        }
    }

    return {
        isBot: false,
        botName: null,
        reason: 'ua-looks-human',
        confidence: 0.78
    };
};

const buildVisitorIdentity = ({ userAgent, geoData }) => {
    const uaDetection = detectBotFromUserAgent(userAgent);
    const providerCrawlerSignal = Boolean(geoData?.isCrawler);
    const isBot = providerCrawlerSignal || uaDetection.isBot;
    const botName = providerCrawlerSignal ? (uaDetection.botName || 'Network Crawler') : uaDetection.botName;
    const reason = providerCrawlerSignal
        ? `ip-intelligence:${geoData?.source || 'unknown'}`
        : uaDetection.reason;
    const confidence = providerCrawlerSignal
        ? 0.95
        : uaDetection.confidence;

    return {
        isBot,
        isCrawler: providerCrawlerSignal || uaDetection.isBot,
        botName: isBot ? botName : null,
        botReason: reason,
        botConfidence: confidence,
        visitorKind: isBot ? 'bot' : 'human',
        visitorEmoji: isBot ? '🤖' : '🧑'
    };
};

const ensureAnalyticsContainers = (db) => {
    if (!db.analytics || typeof db.analytics !== 'object') db.analytics = {};
    if (!Array.isArray(db.analytics.visits)) db.analytics.visits = [];
    if (!db.analytics.reelClicks || typeof db.analytics.reelClicks !== 'object') db.analytics.reelClicks = {};
    if (!db.analytics.sessionDurations || typeof db.analytics.sessionDurations !== 'object') db.analytics.sessionDurations = {};
    if (!db.analytics.profileOverrides || typeof db.analytics.profileOverrides !== 'object') db.analytics.profileOverrides = {};
};

const persistVisitProfileOverride = (visitId, profile) => {
    if (!visitId || !profile || typeof profile !== 'object') return;
    try {
        const db = readDB();
        ensureAnalyticsContainers(db);
        const existing = db.analytics.profileOverrides[visitId] || {};
        const mergedPageHistory = Array.from(new Set([
            ...(Array.isArray(existing.pageHistory) ? existing.pageHistory : []),
            ...(Array.isArray(profile.pageHistory) ? profile.pageHistory : [])
        ])).slice(-30);

        db.analytics.profileOverrides[visitId] = {
            ...existing,
            ...profile,
            pageHistory: mergedPageHistory,
            updatedAt: new Date().toISOString()
        };

        const entries = Object.entries(db.analytics.profileOverrides);
        if (entries.length > 5000) {
            entries
                .sort((a, b) => new Date(b[1]?.updatedAt || 0).getTime() - new Date(a[1]?.updatedAt || 0).getTime())
                .slice(5000)
                .forEach(([id]) => {
                    delete db.analytics.profileOverrides[id];
                });
        }

        writeDB(db);
    } catch (error) {
        console.warn('Failed to persist visitor profile override:', error.message);
    }
};

const mapSupabaseVisit = (visit) => ({
    id: visit.id,
    timestamp: visit.created_at,
    ip: visit.ip,
    userAgent: visit.user_agent,
    deviceType: visit.device_type,
    country: visit.country,
    city: visit.city,
    region: visit.region,
    latitude: visit.latitude,
    longitude: visit.longitude,
    isp: visit.isp,
    isVpn: visit.is_vpn,
    connectionType: visit.connection_type,
    timezone: visit.timezone,
    pageViewed: visit.page_viewed,
    reelId: visit.reel_id,
    sessionDuration: Number(visit.session_duration || 0),
    isCrawler: Boolean(visit.is_crawler ?? visit.isCrawler ?? false),
    isBot: Boolean(visit.is_bot ?? visit.isBot ?? visit.is_crawler ?? visit.isCrawler ?? false),
    botName: visit.bot_name || visit.botName || null,
    botReason: visit.bot_reason || visit.botReason || null,
    botConfidence: Number(visit.bot_confidence ?? visit.botConfidence ?? 0) || 0,
    visitorKind: visit.visitor_kind || visit.visitorKind || null,
    visitorEmoji: visit.visitor_emoji || visit.visitorEmoji || null,
    profileSource: visit.profile_source || visit.profileSource || null,
    pageHistory: Array.isArray(visit.page_history) ? visit.page_history : (Array.isArray(visit.pageHistory) ? visit.pageHistory : [])
});

const mapLocalVisit = (visit) => ({
    id: visit.id,
    timestamp: visit.timestamp || visit.created_at,
    ip: visit.ip,
    userAgent: visit.userAgent || visit.user_agent,
    deviceType: visit.deviceType || visit.device_type,
    country: visit.country,
    city: visit.city,
    region: visit.region,
    latitude: visit.latitude,
    longitude: visit.longitude,
    isp: visit.isp,
    isVpn: visit.isVpn ?? visit.is_vpn,
    connectionType: visit.connectionType || visit.connection_type,
    timezone: visit.timezone,
    pageViewed: visit.pageViewed || visit.page_viewed,
    reelId: visit.reelId || visit.reel_id,
    sessionDuration: Number(visit.sessionDuration ?? visit.session_duration ?? 0),
    isCrawler: Boolean(visit.isCrawler ?? visit.is_crawler ?? false),
    isBot: Boolean(visit.isBot ?? visit.is_bot ?? visit.isCrawler ?? visit.is_crawler ?? false),
    botName: visit.botName || visit.bot_name || null,
    botReason: visit.botReason || visit.bot_reason || null,
    botConfidence: Number(visit.botConfidence ?? visit.bot_confidence ?? 0) || 0,
    visitorKind: visit.visitorKind || visit.visitor_kind || null,
    visitorEmoji: visit.visitorEmoji || visit.visitor_emoji || null,
    profileSource: visit.profileSource || visit.profile_source || null,
    pageHistory: Array.isArray(visit.pageHistory) ? visit.pageHistory : (Array.isArray(visit.page_history) ? visit.page_history : [])
});

const toTimestampMs = (value) => {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
};

const isVisitBeforeBoundary = (visitTimestamp, boundaryIso) => {
    const boundaryMs = toTimestampMs(boundaryIso);
    const visitMs = toTimestampMs(visitTimestamp);
    if (!boundaryMs || !visitMs) return false;
    return visitMs < boundaryMs;
};

const filterVisitsByTimeWindow = (visits, { clearedAt = null, from = null, to = null } = {}) => visits.filter((visit) => {
    const ts = visit?.timestamp;
    if (!ts) return false;
    if (clearedAt && ts < clearedAt) return false;
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
});

const mergeVisits = (primaryVisits = [], secondaryVisits = []) => {
    const merged = [];
    const seen = new Set();

    const pushVisit = (visit) => {
        if (!visit || !visit.timestamp) return;
        const key = visit.id
            ? `id:${visit.id}`
            : `ts:${visit.timestamp}|ip:${visit.ip || ''}|page:${visit.pageViewed || ''}|ua:${visit.userAgent || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(visit);
    };

    primaryVisits.forEach(pushVisit);
    secondaryVisits.forEach(pushVisit);
    return merged;
};

const applyProfileOverrides = (visits, profileOverrides = {}) => visits.map((visit) => {
    const override = profileOverrides?.[visit.id];
    if (!override || typeof override !== 'object') {
        const isBot = Boolean(visit.isBot ?? visit.isCrawler);
        return {
            ...visit,
            isBot,
            visitorKind: visit.visitorKind || (isBot ? 'bot' : 'human'),
            visitorEmoji: visit.visitorEmoji || (isBot ? '🤖' : '🧑'),
            pageHistory: Array.isArray(visit.pageHistory) ? visit.pageHistory : []
        };
    }

    const isVpn = typeof override.isVpn === 'boolean' ? override.isVpn : visit.isVpn;
    const isCrawler = typeof override.isCrawler === 'boolean' ? override.isCrawler : Boolean(visit.isCrawler);
    const isBot = typeof override.isBot === 'boolean' ? override.isBot : (Boolean(visit.isBot) || isCrawler);

    return {
        ...visit,
        country: override.country || visit.country,
        city: override.city || visit.city,
        region: override.region || visit.region,
        latitude: Number(override.latitude ?? visit.latitude ?? 0),
        longitude: Number(override.longitude ?? visit.longitude ?? 0),
        isp: override.isp || visit.isp,
        timezone: override.timezone || visit.timezone,
        connectionType: override.connectionType || visit.connectionType,
        pageViewed: override.pageViewed || visit.pageViewed,
        isVpn,
        isCrawler,
        isBot,
        botName: override.botName || visit.botName || null,
        botReason: override.botReason || visit.botReason || null,
        botConfidence: Number(override.botConfidence ?? visit.botConfidence ?? 0) || 0,
        visitorKind: override.visitorKind || visit.visitorKind || (isBot ? 'bot' : 'human'),
        visitorEmoji: override.visitorEmoji || visit.visitorEmoji || (isBot ? '🤖' : '🧑'),
        profileSource: override.profileSource || visit.profileSource || null,
        pageHistory: Array.from(new Set([
            ...(Array.isArray(visit.pageHistory) ? visit.pageHistory : []),
            ...(Array.isArray(override.pageHistory) ? override.pageHistory : [])
        ])).slice(-30)
    };
});

const getDailyKeys = (count = 7) => {
    const keys = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        keys.push(d.toISOString().slice(0, 10));
    }
    return keys;
};

const parseDateParam = (value, { endOfDay = false } = {}) => {
    if (!value || typeof value !== 'string') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    if (value.length <= 10) {
        if (endOfDay) parsed.setUTCHours(23, 59, 59, 999);
        else parsed.setUTCHours(0, 0, 0, 0);
    }
    return parsed.toISOString();
};

const applySessionDurationOverrides = (visits, overrides = {}) => visits.map((visit) => {
    const override = overrides[visit.id];
    if (typeof override !== 'number') return visit;
    return { ...visit, sessionDuration: Math.max(0, Number(override) || 0) };
});

const buildAnalyticsStats = (visits) => {
    const totalVisitors = visits.length;
    const uniqueVisitors = new Set(visits.map((visit) => visit.ip).filter(Boolean)).size;
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayCount = visits.filter((visit) => visit.timestamp?.startsWith(todayKey)).length;

    const countries = {};
    const devices = { mobile: 0, desktop: 0 };
    const connection = { wifi_ethernet: 0, cellular: 0, unknown: 0 };
    let vpnCount = 0;
    let sessionSum = 0;
    let sessionCount = 0;

    visits.forEach((visit) => {
        if (visit.country) countries[visit.country] = (countries[visit.country] || 0) + 1;
        if (visit.deviceType === 'mobile') devices.mobile += 1;
        else if (visit.deviceType === 'desktop') devices.desktop += 1;

        if (visit.connectionType === 'wifi' || visit.connectionType === 'ethernet') connection.wifi_ethernet += 1;
        else if (visit.connectionType === 'cellular') connection.cellular += 1;
        else connection.unknown += 1;

        if (visit.isVpn) vpnCount += 1;

        const duration = Number(visit.sessionDuration);
        if (!Number.isNaN(duration) && duration >= 0) {
            sessionSum += duration;
            sessionCount += 1;
        }
    });

    const dailyKeys = getDailyKeys(7);
    const dailyVisits = dailyKeys.map((key) => ({
        date: key,
        count: visits.filter((visit) => visit.timestamp?.startsWith(key)).length
    }));

    return {
        total_visitors: totalVisitors,
        unique_visitors: uniqueVisitors,
        today: todayCount,
        countries,
        devices,
        vpn_count: vpnCount,
        connection,
        average_session_seconds: sessionCount > 0 ? Math.round(sessionSum / sessionCount) : 0,
        daily_visits: dailyVisits
    };
};

const isLikelyIpSearch = (value = '') => /^(\d{1,3}\.){1,3}\d{1,3}$|^[a-f0-9:]{2,}$/i.test(value.trim());

const visitMatchesSearch = (visit, query) => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return true;

    const vpnLabel = visit.isVpn ? 'vpn true yes' : 'vpn false no';
    const fields = [
        visit.id,
        visit.ip,
        visit.userAgent,
        visit.deviceType,
        visit.country,
        visit.city,
        visit.region,
        visit.isp,
        visit.connectionType,
        visit.timezone,
        visit.pageViewed,
        visit.reelId,
        visit.timestamp,
        Number(visit.sessionDuration || 0),
        vpnLabel,
        visit.visitorKind,
        visit.botName,
        visit.botReason,
        visit.profileSource
    ];

    return fields.some((value) => String(value ?? '').toLowerCase().includes(normalized));
};

const buildIpSearchSummary = (visits, query) => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized || !isLikelyIpSearch(normalized)) return null;

    const matches = visits
        .filter((visit) => String(visit.ip || '').toLowerCase().includes(normalized))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (matches.length === 0) return null;

    const totalDuration = matches.reduce((sum, visit) => sum + Math.max(0, Number(visit.sessionDuration) || 0), 0);
    const uniquePages = Array.from(new Set(matches.map((visit) => visit.pageViewed).filter(Boolean)));
    const vpnHits = matches.filter((visit) => Boolean(visit.isVpn)).length;
    const first = matches[0];
    const last = matches[matches.length - 1];

    return {
        ip: first.ip || normalized,
        visits: matches.length,
        totalDuration,
        averageDuration: Math.round(totalDuration / matches.length),
        uniquePages,
        firstSeen: first.timestamp || null,
        lastSeen: last.timestamp || null,
        vpnHits
    };
};

const getCacheKey = ({ clearedAt, from, to }) => `${clearedAt || 'all'}:${from || 'none'}:${to || 'none'}`;

const fetchSupabaseVisits = async ({ clearedAt, from, to }) => {
    const cacheKey = getCacheKey({ clearedAt, from, to });
    if (analyticsCache.key === cacheKey && Date.now() - analyticsCache.timestamp < 15000) {
        return analyticsCache.visits;
    }

    const allVisits = [];
    const batchSize = 1000;
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
        let query = supabase
            .from('visitors')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + batchSize - 1);

        if (clearedAt) query = query.gte('created_at', clearedAt);
        if (from) query = query.gte('created_at', from);
        if (to) query = query.lte('created_at', to);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;

        allVisits.push(...data.map(mapSupabaseVisit));
        offset += batchSize;
        keepFetching = data.length === batchSize;

        if (offset >= 10000) keepFetching = false;
    }

    analyticsCache = { key: cacheKey, timestamp: Date.now(), visits: allVisits };
    return allVisits;
};

// =====================
// AUTH SESSION VALIDATION
// =====================

const getSessionIdFromRequest = (req) =>
    req.signedCookies?.[SESSION_COOKIE_NAME]
    || req.cookies?.[SESSION_COOKIE_NAME]
    || req.headers.authorization?.split(' ')[1]
    || req.body?.token
    || req.query?.token;

const setSessionCookie = (res, sessionId) => {
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        signed: true,
        secure: SESSION_COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: ADMIN_SESSION_TTL_MS,
        path: '/'
    });
};

const clearSessionCookie = (res) => {
    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        signed: true,
        secure: SESSION_COOKIE_SECURE,
        sameSite: 'lax',
        path: '/'
    });
};

const validateAdminToken = async (req, res, next) => {
    try {
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) {
            return res.status(401).json({ success: false, message: 'No active session' });
        }

        const session = await getSessionData(sessionId);
        if (!session) {
            clearSessionCookie(res);
            return res.status(401).json({ success: false, message: 'Session expired or invalid' });
        }

        req.adminSessionId = sessionId;
        req.adminSession = session;
        next();
    } catch (error) {
        reportServerError('Session Validation Error', error, req);
        return res.status(500).json({ success: false, message: 'Session validation failed' });
    }
};

// =====================
// API ROUTES
// =====================

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        hasDist: HAS_DIST,
        hasSupabaseKey: Boolean(supabaseKey),
        redisEnabled: REDIS_ENABLED,
        redisStatus,
        redisConnected,
        authMode: 'cookie-session'
    });
});

app.get('/api/security/block-status', (req, res) => {
    const ip = getClientIP(req);
    const status = getIpBlockStatus(ip);
    res.json({
        blocked: status.blocked,
        reason: status.reason || null,
        blockedUntil: status.blockedUntil || null,
        remainingSeconds: Math.max(0, Math.ceil((status.remainingMs || 0) / 1000)),
        ip
    });
});

app.post('/api/security/appeal', async (req, res) => {
    try {
        const ip = getClientIP(req);
        const status = getIpBlockStatus(ip);
        if (!status.blocked) {
            return res.status(400).json({ success: false, error: 'IP is not currently blocked.' });
        }

        const now = Date.now();
        const lastSubmitted = Number(memoryAppealSubmissions.get(ip) || 0);
        if (lastSubmitted && (now - lastSubmitted) < APPEAL_MIN_INTERVAL_MS) {
            const waitSeconds = Math.ceil((APPEAL_MIN_INTERVAL_MS - (now - lastSubmitted)) / 1000);
            return res.status(429).json({ success: false, error: `Please wait ${waitSeconds}s before submitting another appeal.` });
        }

        const message = sanitizeString(req.body?.message || '', 450);
        const contact = sanitizeString(req.body?.contact || '', 120);
        if (!message || message.length < 10) {
            return res.status(400).json({ success: false, error: 'Please provide more detail (minimum 10 characters).' });
        }

        memoryAppealSubmissions.set(ip, now);
        const db = readDB();
        if (!db.security || typeof db.security !== 'object') db.security = { blockedIps: {}, appeals: [] };
        if (!Array.isArray(db.security.appeals)) db.security.appeals = [];

        const appealId = crypto.randomUUID();
        const geo = await getGeoDataCached(ip);
        const geoSummary = geo ? `${geo.city || 'Unknown'}, ${geo.country || 'Unknown'} | ISP: ${geo.isp || 'Unknown'} | VPN: ${geo.isVpn ? 'yes' : 'no'}` : 'Geo unavailable';
        const appeal = {
            id: appealId,
            ip,
            reason: status.reason || 'Security policy triggered',
            blockedUntil: status.blockedUntil || null,
            message,
            contact,
            geo: geo || null,
            userAgent: req.body?.userAgent || req.headers['user-agent'] || 'Unknown',
            createdAt: new Date().toISOString(),
            status: 'pending',
            decision: null,
            adminNote: null,
            resolvedAt: null
        };

        db.security.appeals.unshift(appeal);
        if (db.security.appeals.length > 500) db.security.appeals = db.security.appeals.slice(0, 500);
        writeDB(db);

        const notifyMessage = `Appeal submitted. reason="${appeal.reason}" | user="${message}" | contact="${contact || 'n/a'}" | ${geoSummary}`;
        logNotification(
            'appeal',
            'Unban Appeal Received',
            sanitizeString(notifyMessage, 450),
            ip,
            { appealId, status: 'pending', blockedUntil: status.blockedUntil || null }
        );

        return res.json({ success: true, appealId });
    } catch (error) {
        reportServerError('Appeal Submit Error', error, req);
        return res.status(500).json({ success: false, error: 'Failed to submit appeal.' });
    }
});

app.post('/api/security/appeals/:id/decision', validateAdminToken, (req, res) => {
    try {
        const appealId = req.params.id;
        const decision = String(req.body?.decision || '').toLowerCase();
        const adminNote = sanitizeString(req.body?.adminNote || '', 220);
        if (!['unblock', 'keep'].includes(decision)) {
            return res.status(400).json({ success: false, error: 'Decision must be `unblock` or `keep`.' });
        }

        const db = readDB();
        if (!db.security || typeof db.security !== 'object') db.security = { blockedIps: {}, appeals: [] };
        if (!Array.isArray(db.security.appeals)) db.security.appeals = [];

        const idx = db.security.appeals.findIndex((appeal) => appeal.id === appealId);
        if (idx === -1) {
            return res.status(404).json({ success: false, error: 'Appeal not found.' });
        }

        const appeal = db.security.appeals[idx];
        const nowIso = new Date().toISOString();
        appeal.status = 'resolved';
        appeal.decision = decision;
        appeal.adminNote = adminNote || null;
        appeal.resolvedAt = nowIso;

        if (decision === 'unblock') {
            unblockIp(appeal.ip);
            logNotification('security', 'IP Unblocked By Admin', `Appeal ${appealId} approved. IP ${appeal.ip} was unblocked.`, appeal.ip);
        } else {
            const active = getIpBlockStatus(appeal.ip);
            if (!active.blocked) {
                blockIpTemporarily(appeal.ip, TEMP_BLOCK_DURATION_MS, 'Appeal denied by admin');
            }
            logNotification('warning', 'Appeal Denied', `Appeal ${appealId} denied. IP ${appeal.ip} remains blocked.`, appeal.ip);
        }

        if (Array.isArray(db.notifications)) {
            const nIdx = db.notifications.findIndex((n) => n?.metadata?.appealId === appealId);
            if (nIdx !== -1) {
                db.notifications[nIdx].metadata = {
                    ...(db.notifications[nIdx].metadata || {}),
                    status: 'resolved',
                    decision
                };
            }
        }

        writeDB(db);
        return res.json({ success: true, appeal });
    } catch (error) {
        reportServerError('Appeal Decision Error', error, req);
        return res.status(500).json({ success: false, error: 'Failed to process appeal decision.' });
    }
});

// Get Content
app.get('/api/content', (req, res) => {
    try {
        const db = readDB();
        res.json(db.content);
    } catch (error) {
        reportServerError('Content Read Error', error, req);
        res.status(500).json({ error: 'Failed to read content' });
    }
});

// Sitemap.xml for SEO
app.get('/sitemap.xml', (req, res) => {
    try {
        const db = readDB();
        const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
`;

        // Add all projects to sitemap
        if (db.content?.projects && Array.isArray(db.content.projects)) {
            db.content.projects.forEach(project => {
                xml += `  <url>
    <loc>${baseUrl}/project/${project.id}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
            });
        }

        xml += `</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Sitemap generation error:', error);
        res.status(500).send('Error generating sitemap');
    }
});

// Robots.txt for SEO
app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(robotsTxt);
});

// Update Content
app.post('/api/content', validateAdminToken, (req, res) => {
    try {
        const db = readDB();
        const content = req.body;
        const ip = getClientIP(req);

        // Validate content structure
        if (typeof content !== 'object' || content === null) {
            return res.status(400).json({ error: 'Invalid content structure' });
        }

        // Validate projects if present
        if (content.projects && Array.isArray(content.projects)) {
            for (const project of content.projects) {
                if (!project.id || !project.title) {
                    return res.status(400).json({ error: 'Each project must have id and title' });
                }
                // Sanitize strings
                project.title = sanitizeString(project.title, 200);
                project.category = sanitizeString(project.category, 100);
                if (project.link && !validateUrl(project.link)) {
                    return res.status(400).json({ error: 'Invalid project link URL' });
                }
            }
        }

        // Validate reviews if present
        if (content.reviews && Array.isArray(content.reviews)) {
            for (const review of content.reviews) {
                if (!review.id || !review.name) {
                    return res.status(400).json({ error: 'Each review must have id and name' });
                }
                review.name = sanitizeString(review.name, 100);
                review.role = sanitizeString(review.role, 100);
                review.text = sanitizeString(review.text, 500);
            }
        }

        // Validate social links if present
        if (content.social && typeof content.social === 'object') {
            if (content.social.email && !validateEmail(content.social.email)) {
                return res.status(400).json({ error: 'Invalid email in social links' });
            }
        }

        const previousContent = JSON.parse(JSON.stringify(db.content || {}));
        if (!Array.isArray(db.contentHistory)) db.contentHistory = [];
        db.contentHistory.unshift({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            action: 'content_update',
            actorIp: ip,
            content: previousContent
        });
        if (db.contentHistory.length > CONTENT_HISTORY_LIMIT) {
            db.contentHistory = db.contentHistory.slice(0, CONTENT_HISTORY_LIMIT);
        }

        db.content = { ...db.content, ...content };
        writeDB(db);
        logNotification('info', 'Content Updated', `Website content was modified via CMS from ${ip}`, ip);
        res.json({ success: true, content: db.content });
    } catch (error) {
        console.error('Content update error:', error);
        reportServerError('Content Update Error', error, req);
        res.status(500).json({ error: 'Failed to update content' });
    }
});

app.get('/api/content/history', validateAdminToken, (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
        const db = readDB();
        const history = (db.contentHistory || []).slice(0, limit).map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp,
            action: entry.action,
            actorIp: entry.actorIp,
            projectCount: Array.isArray(entry.content?.projects) ? entry.content.projects.length : 0,
            reviewCount: Array.isArray(entry.content?.reviews) ? entry.content.reviews.length : 0
        }));

        res.json({ history });
    } catch (error) {
        reportServerError('Content History Read Error', error, req);
        res.status(500).json({ error: 'Failed to fetch content history' });
    }
});

app.post('/api/content/history/:id/rollback', validateAdminToken, (req, res) => {
    try {
        const db = readDB();
        const target = (db.contentHistory || []).find((entry) => entry.id === req.params.id);
        if (!target || !target.content) {
            return res.status(404).json({ error: 'Version not found' });
        }

        if (!Array.isArray(db.contentHistory)) db.contentHistory = [];
        db.contentHistory.unshift({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            action: `rollback_backup:${req.params.id}`,
            actorIp: getClientIP(req),
            content: JSON.parse(JSON.stringify(db.content || {}))
        });
        if (db.contentHistory.length > CONTENT_HISTORY_LIMIT) {
            db.contentHistory = db.contentHistory.slice(0, CONTENT_HISTORY_LIMIT);
        }

        db.content = JSON.parse(JSON.stringify(target.content));
        writeDB(db);
        logNotification('warning', 'Content Rolled Back', `Content reverted to snapshot ${req.params.id}`, getClientIP(req));
        res.json({ success: true, content: db.content });
    } catch (error) {
        reportServerError('Content Rollback Error', error, req);
        res.status(500).json({ error: 'Failed to rollback content version' });
    }
});

// Image Upload to Supabase Storage
app.post('/api/upload', validateAdminToken, async (req, res) => {
    try {
        const { file, filename, type } = req.body;

        // Validate input
        if (!file || !filename) {
            return res.status(400).json({ error: 'File and filename required' });
        }

        // Validate filename (prevent path traversal)
        if (filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (type && !allowedTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP allowed.' });
        }

        // Validate file size (max 5MB)
        const base64Size = file.length * 0.75; // Approximate size of base64 encoded data
        if (base64Size > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large. Maximum 5MB allowed.' });
        }

        // Decode base64
        const base64Data = file.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Generate unique filename
        const ext = filename.split('.').pop() || 'png';
        const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

        // Upload to Supabase
        const { data, error } = await supabase.storage
            .from('portfolio-images')
            .upload(uniqueName, buffer, {
                contentType: type || 'image/png',
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            return res.status(500).json({ error: 'Upload failed: ' + error.message });
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('portfolio-images')
            .getPublicUrl(uniqueName);

        logNotification('info', 'Image Uploaded', `New image uploaded: ${uniqueName}`);
        res.json({ success: true, url: urlData.publicUrl, filename: uniqueName });
    } catch (error) {
        console.error('Upload error:', error);
        reportServerError('Upload Error', error, req);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Login with security logging
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const ip = getClientIP(req);
        const loginKey = `${sanitizeString(String(username || ''), 60).toLowerCase()}:${ip}`;

        // Validate input
        if (!validateUsername(username) || !validatePassword(password)) {
            logNotification('warning', 'Invalid Login Attempt', `Invalid credentials format from IP: ${ip}`, ip);
            return res.status(400).json({ success: false, message: 'Invalid credentials format' });
        }

        const attemptState = await getLoginAttemptState(loginKey);
        const now = Date.now();
        if (attemptState?.lockUntil && attemptState.lockUntil > now) {
            const retryAfterSeconds = Math.ceil((attemptState.lockUntil - now) / 1000);
            return res.status(429).json({
                success: false,
                message: `Too many failed attempts. Try again in ${retryAfterSeconds}s.`,
                retryAfterSeconds
            });
        }

        const db = readDB();

        // Compare password with hash
        const passwordMatch = await bcrypt.compare(password, db.auth.passwordHash || '');

        if (username === db.auth.username && passwordMatch) {
            await clearLoginAttemptState(loginKey);
            const { sessionId, expiresAt } = await createSession({
                ip,
                username: db.auth.username,
                userAgent: req.headers['user-agent'] || '',
                createdAt: now
            });
            setSessionCookie(res, sessionId);
            logNotification('security', 'Login Success', `Admin login from IP: ${ip}`, ip);
            res.json({ success: true, expiresInMs: ADMIN_SESSION_TTL_MS, expiresAt });
        } else {
            const previous = attemptState && (now - (attemptState.firstFailureAt || 0)) <= LOGIN_LOCK_WINDOW_MS
                ? attemptState
                : { failedAttempts: 0, firstFailureAt: now, lockUntil: 0 };
            const failedAttempts = (previous.failedAttempts || 0) + 1;
            const lockUntil = failedAttempts >= LOGIN_LOCK_THRESHOLD ? (now + LOGIN_LOCK_DURATION_MS) : 0;
            await setLoginAttemptState(loginKey, {
                failedAttempts,
                firstFailureAt: previous.firstFailureAt || now,
                lockUntil,
                lastFailureAt: now
            });

            const backoffMs = getLoginBackoffMs(failedAttempts);
            if (backoffMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }

            logNotification('warning', 'Failed Login Attempt', `Failed login attempt from IP: ${ip} with username: ${username}`, ip);
            res.status(401).json({
                success: false,
                message: lockUntil ? 'Too many failed attempts. Account temporarily locked.' : 'Invalid credentials',
                lockUntil: lockUntil || null
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        reportServerError('Login Error', error, req);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Validate Token
app.post('/api/validate-token', validateAdminToken, (req, res) => {
    res.json({
        success: true,
        valid: true,
        expiresAt: req.adminSession?.expiresAt || null
    });
});

app.post('/api/logout', validateAdminToken, async (req, res) => {
    await deleteSession(req.adminSessionId);
    clearSessionCookie(res);
    res.json({ success: true });
});

// Track Visitor
app.post('/api/track', async (req, res) => {
    try {
        const { userAgent, pageViewed, reelId } = req.body || {};
        const clientIP = getClientIP(req);
        const geoData = isLocalOrPrivateIp(clientIP)
            ? await fetchGeoData(clientIP)
            : (await getGeoDataCached(clientIP)) || await fetchGeoData(clientIP);
        const deviceType = getDeviceType(userAgent);
        const visitorIdentity = buildVisitorIdentity({ userAgent, geoData });
        const db = readDB();
        const clearedAt = db.analytics?.clearedAt || null;

        const visitorData = {
            ip: clientIP,
            user_agent: userAgent || 'Unknown',
            device_type: deviceType,
            country: geoData.country,
            city: geoData.city,
            region: geoData.region,
            latitude: geoData.latitude,
            longitude: geoData.longitude,
            isp: geoData.isp,
            is_vpn: geoData.isVpn,
            connection_type: geoData.connectionType,
            timezone: geoData.timezone,
            page_viewed: pageViewed || '/',
            reel_id: reelId || null,
            session_duration: 0
        };

        const profileOverride = {
            country: geoData.country,
            city: geoData.city,
            region: geoData.region,
            latitude: geoData.latitude,
            longitude: geoData.longitude,
            isp: geoData.isp,
            isVpn: geoData.isVpn,
            connectionType: geoData.connectionType,
            timezone: geoData.timezone,
            isCrawler: visitorIdentity.isCrawler,
            isBot: visitorIdentity.isBot,
            botName: visitorIdentity.botName,
            botReason: visitorIdentity.botReason,
            botConfidence: visitorIdentity.botConfidence,
            visitorKind: visitorIdentity.visitorKind,
            visitorEmoji: visitorIdentity.visitorEmoji,
            profileSource: geoData.source || 'fallback',
            pageViewed: pageViewed || '/',
            pageHistory: [pageViewed || '/']
        };

        // Prevent duplicate rapid-fire visits from same IP within 60 seconds
        const now = Date.now();
        const recentWindow = 60 * 1000; // 60 seconds

        // Check local fallback DB first for recent visit
        if (!db.analytics) db.analytics = { visits: [], reelClicks: {} };
        if (!db.analytics.sessionDurations) db.analytics.sessionDurations = {};
        const recentLocal = db.analytics.visits.find((visit) => {
            if (visit.ip !== clientIP) return false;
            if (isVisitBeforeBoundary(visit.timestamp || visit.created_at, clearedAt)) return false;
            return (now - new Date(visit.timestamp || visit.created_at).getTime()) < recentWindow;
        });
        if (recentLocal) {
            // Update pageViewed if new
            recentLocal.page_viewed = pageViewed || recentLocal.page_viewed;
            Object.assign(recentLocal, profileOverride);
            writeDB(db);
            analyticsCache = { timestamp: 0, key: '', visits: [] };
            persistVisitProfileOverride(recentLocal.id, profileOverride);
            return res.json({ success: true, visitId: recentLocal.id, source: 'local_recent' });
        }

        // Try to insert into Supabase; if it fails, fall back to local DB
        try {
            const { data: recentSupabase } = await supabase
                .from('visitors')
                .select('id, created_at, page_viewed')
                .eq('ip', clientIP)
                .order('created_at', { ascending: false })
                .limit(1);

            const latestVisit = recentSupabase?.[0];
            const latestCreatedAtMs = toTimestampMs(latestVisit?.created_at);
            const canReuseSupabaseVisit = Boolean(
                latestVisit
                && latestCreatedAtMs
                && !isVisitBeforeBoundary(latestVisit.created_at, clearedAt)
                && (now - latestCreatedAtMs) < (30 * 60 * 1000)
            );

            if (canReuseSupabaseVisit) {
                if (pageViewed && pageViewed !== latestVisit.page_viewed) {
                    await supabase.from('visitors').update({ page_viewed: pageViewed }).eq('id', latestVisit.id);
                }
                analyticsCache = { timestamp: 0, key: '', visits: [] };
                persistVisitProfileOverride(latestVisit.id, profileOverride);
                return res.json({ success: true, visitId: latestVisit.id, source: 'supabase_recent' });
            }

            const { data, error } = await supabase.from('visitors').insert([visitorData]).select().single();
            if (error || !data) throw error || new Error('No data');
            analyticsCache = { timestamp: 0, key: '', visits: [] };
            persistVisitProfileOverride(data.id, profileOverride);
            return res.json({ success: true, visitId: data.id, source: 'supabase' });
        } catch (err) {
            // Supabase failed or not configured — store locally but avoid duplicates
            const localVisit = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...visitorData, ...profileOverride };
            db.analytics.visits.push(localVisit);
            // Keep list length limited
            if (db.analytics.visits.length > 2000) db.analytics.visits = db.analytics.visits.slice(-2000);
            writeDB(db);
            analyticsCache = { timestamp: 0, key: '', visits: [] };
            persistVisitProfileOverride(localVisit.id, profileOverride);
            return res.json({ success: true, visitId: localVisit.id, source: 'local' });
        }
    } catch (error) {
        console.error("Tracking Error:", error);
        reportServerError('Tracking Error', error, req);
        res.json({ success: false });
    }
});

app.post('/api/track/page', async (req, res) => {
    try {
        const visitId = sanitizeString(String(req.body?.visitId || ''), 128);
        const pageViewed = sanitizeString(String(req.body?.pageViewed || '/'), 240) || '/';
        if (!visitId) return res.json({ success: false });

        const db = readDB();
        ensureAnalyticsContainers(db);

        const localIndex = db.analytics.visits.findIndex((visit) => String(visit.id) === visitId);
        if (localIndex !== -1) {
            db.analytics.visits[localIndex].page_viewed = pageViewed;
            const currentHistory = Array.isArray(db.analytics.visits[localIndex].page_history)
                ? db.analytics.visits[localIndex].page_history
                : [];
            db.analytics.visits[localIndex].page_history = Array.from(new Set([...currentHistory, pageViewed])).slice(-30);
        }

        const profile = db.analytics.profileOverrides[visitId] || {};
        const profileHistory = Array.isArray(profile.pageHistory) ? profile.pageHistory : [];
        db.analytics.profileOverrides[visitId] = {
            ...profile,
            pageViewed,
            pageHistory: Array.from(new Set([...profileHistory, pageViewed])).slice(-30),
            updatedAt: new Date().toISOString()
        };

        writeDB(db);
        analyticsCache = { timestamp: 0, key: '', visits: [] };

        const { error } = await supabase.from('visitors').update({ page_viewed: pageViewed }).eq('id', visitId);
        if (error) {
            logNotification('warning', 'Page Tracking Sync Warning', `Failed to sync page path to Supabase: ${error.message}`, null);
        }

        return res.json({ success: true });
    } catch (error) {
        reportServerError('Page Tracking Error', error, req);
        return res.json({ success: false });
    }
});

// Session Heartbeat
app.post('/api/track/heartbeat', async (req, res) => {
    try {
        const visitId = req.body?.visitId;
        const duration = Math.max(0, Number(req.body?.duration) || 0);
        const sessionStartedAt = req.body?.sessionStartedAt;
        if (!visitId) return res.json({ success: false });

        const db = readDB();
        if (!db.analytics) db.analytics = { visits: [], reelClicks: {}, sessionDurations: {} };
        if (!db.analytics.sessionDurations || typeof db.analytics.sessionDurations !== 'object') {
            db.analytics.sessionDurations = {};
        }

        if (isVisitBeforeBoundary(sessionStartedAt, db.analytics?.clearedAt || null)) {
            return res.json({
                success: false,
                resetVisit: true,
                reason: 'analytics_cleared'
            });
        }

        db.analytics.sessionDurations[visitId] = duration;

        const { error } = await supabase.from('visitors').update({ session_duration: duration }).eq('id', visitId);

        if (error) {
            const idx = db.analytics.visits.findIndex(v => v.id === visitId);
            if (idx !== -1) {
                db.analytics.visits[idx].session_duration = duration;
            }
            logNotification('warning', 'Heartbeat Sync Warning', `Failed to sync session duration to Supabase: ${error.message}`, null);
        }
        writeDB(db);
        analyticsCache = { timestamp: 0, key: '', visits: [] };
        res.json({ success: true });
    } catch (error) {
        reportServerError('Heartbeat Error', error, req);
        res.json({ success: false });
    }
});

// Track Reel Click
app.post('/api/track/reel', async (req, res) => {
    try {
        const { reelId, visitId } = req.body;
        if (!reelId) {
            return res.json({ success: false, error: 'Missing reelId' });
        }
        const db = readDB();
        if (!db.analytics.reelClicks) db.analytics.reelClicks = {};
        db.analytics.reelClicks[reelId] = (db.analytics.reelClicks[reelId] || 0) + 1;
        if (visitId) {
            await supabase.from('visitors').update({ reel_id: reelId }).eq('id', visitId);
        }
        writeDB(db);
        analyticsCache = { timestamp: 0, key: '', visits: [] };
        res.json({ success: true });
    } catch (error) {
        reportServerError('Reel Tracking Error', error, req);
        res.json({ success: false });
    }
});

// Get Analytics with pagination
app.get('/api/analytics', validateAdminToken, async (req, res) => {
    const searchQuery = sanitizeString(String(req.query.q || ''), 120).toLowerCase();
    const ipQuery = sanitizeString(String(req.query.ip || ''), 120).toLowerCase();
    const pagePathQuery = sanitizeString(String(req.query.pagePath || ''), 120).toLowerCase();

    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const from = parseDateParam(req.query.from);
        const to = parseDateParam(req.query.to, { endOfDay: true });
        if (from && to && from > to) {
            return res.status(400).json({ error: '`from` date must be before `to` date' });
        }
        const db = readDB();
        const clearedAt = db.analytics?.clearedAt || null;
        const durationOverrides = db.analytics?.sessionDurations || {};
        const localVisits = filterVisitsByTimeWindow(
            (db.analytics?.visits || []).map(mapLocalVisit),
            { clearedAt, from, to }
        );
        let allVisits = [];

        try {
            const supabaseVisits = await fetchSupabaseVisits({ clearedAt, from, to });
            allVisits = mergeVisits(supabaseVisits, localVisits);
        } catch (supabaseError) {
            console.warn('Supabase analytics fetch failed, using local fallback:', supabaseError.message);
            allVisits = localVisits;
        }

        allVisits = applyProfileOverrides(allVisits, db.analytics?.profileOverrides || {});
        allVisits = applySessionDurationOverrides(allVisits, durationOverrides);

        if (ipQuery) {
            allVisits = allVisits.filter((visit) => String(visit.ip || '').toLowerCase().includes(ipQuery));
        }
        if (pagePathQuery) {
            allVisits = allVisits.filter((visit) => String(visit.pageViewed || '').toLowerCase().includes(pagePathQuery));
        }
        if (searchQuery) {
            allVisits = allVisits.filter((visit) => visitMatchesSearch(visit, searchQuery));
        }

        allVisits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const visits = allVisits.slice(offset, offset + limit);
        const total = allVisits.length;
        const stats = buildAnalyticsStats(allVisits);
        const ipSummary = buildIpSearchSummary(allVisits, ipQuery || searchQuery);

        res.json({
            visits,
            pagination: { page, limit, total },
            reelClicks: db.analytics?.reelClicks || {},
            stats,
            ipSummary,
            filters: {
                from: from || null,
                to: to || null,
                clearedAt,
                q: searchQuery || null,
                ip: ipQuery || null,
                pagePath: pagePathQuery || null
            }
        });
    } catch (error) {
        console.error('Analytics fetch error:', error);
        reportServerError('Analytics Fetch Error', error, req);
        const db = readDB();
        const fallbackClearedAt = db.analytics?.clearedAt || null;
        let visits = filterVisitsByTimeWindow((db.analytics?.visits || []).map(mapLocalVisit), {
            clearedAt: fallbackClearedAt
        });
        visits = applyProfileOverrides(visits, db.analytics?.profileOverrides || {});
        visits = applySessionDurationOverrides(visits, db.analytics?.sessionDurations || {});
        if (ipQuery) {
            visits = visits.filter((visit) => String(visit.ip || '').toLowerCase().includes(ipQuery));
        }
        if (pagePathQuery) {
            visits = visits.filter((visit) => String(visit.pageViewed || '').toLowerCase().includes(pagePathQuery));
        }
        if (searchQuery) {
            visits = visits.filter((visit) => visitMatchesSearch(visit, searchQuery));
        }
        const ipSummary = buildIpSearchSummary(visits, ipQuery || searchQuery);
        res.json({
            visits,
            pagination: { page: 1, limit: visits.length || 50, total: visits.length },
            reelClicks: db.analytics?.reelClicks || {},
            stats: buildAnalyticsStats(visits),
            ipSummary,
            filters: {
                q: searchQuery || null,
                ip: ipQuery || null,
                pagePath: pagePathQuery || null
            }
        });
    }
});

// =====================
// NOTIFICATIONS API
// =====================

app.get('/api/notifications', validateAdminToken, (req, res) => {
    try {
        const db = readDB();
        res.json({ notifications: db.notifications || [] });
    } catch (error) {
        reportServerError('Notifications Read Error', error, req);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.post('/api/notifications/:id/read', validateAdminToken, (req, res) => {
    try {
        const db = readDB();
        if (!db.notifications) db.notifications = [];
        const idx = db.notifications.findIndex(n => n.id === req.params.id);
        if (idx !== -1) {
            db.notifications[idx].read = true;
            writeDB(db);
        }
        res.json({ success: true });
    } catch (error) {
        reportServerError('Notifications Mark Read Error', error, req);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

app.delete('/api/notifications/:id', validateAdminToken, (req, res) => {
    try {
        const db = readDB();
        if (!db.notifications) db.notifications = [];
        db.notifications = db.notifications.filter(n => n.id !== req.params.id);
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        reportServerError('Notifications Delete Error', error, req);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

app.post('/api/notifications/clear', validateAdminToken, (req, res) => {
    try {
        const db = readDB();
        if (!db.notifications) db.notifications = [];
        db.notifications = [];
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        reportServerError('Notifications Clear Error', error, req);
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

// Settings - Update Password
app.post('/api/settings/password', validateAdminToken, async (req, res) => {
    try {
        const db = readDB();
        const { username, newPassword } = req.body;
        const ip = getClientIP(req);

        // Validate input
        if (!validateUsername(username) || !validatePassword(newPassword)) {
            return res.status(400).json({ success: false, message: 'Invalid username or password format' });
        }

        if (username === db.auth.username) {
            // Hash password with bcrypt
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(newPassword, saltRounds);
            
            db.auth.passwordHash = passwordHash;
            writeDB(db);
            logNotification('security', 'Password Changed', `Admin password was changed from IP: ${ip}`, ip);
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: 'Invalid username' });
        }
    } catch (error) {
        console.error('Password change error:', error);
        reportServerError('Password Change Error', error, req);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

const countSupabaseVisitors = async ({ from = null } = {}) => {
    let query = supabase.from('visitors').select('id', { count: 'exact', head: true });
    if (from) {
        query = query.gte('created_at', from);
    }
    const { count, error } = await query;
    if (error) throw error;
    return Number(count || 0);
};

const deleteSupabaseVisitorsInBatches = async () => {
    let totalProcessed = 0;
    for (let i = 0; i < 200; i += 1) {
        const { data, error } = await supabase
            .from('visitors')
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1000);

        if (error) throw error;
        if (!data || data.length === 0) break;

        const ids = data.map((row) => row.id).filter(Boolean);
        if (ids.length === 0) break;

        const { error: deleteError } = await supabase.from('visitors').delete().in('id', ids);
        if (deleteError) throw deleteError;
        totalProcessed += ids.length;

        if (data.length < 1000) break;
    }
    return totalProcessed;
};

app.get('/api/settings/analytics-count', validateAdminToken, async (_req, res) => {
    try {
        const db = readDB();
        const clearedAt = db.analytics?.clearedAt || null;
        let supabaseCount = 0;
        let supabaseAvailable = true;

        try {
            supabaseCount = await countSupabaseVisitors({ from: clearedAt });
        } catch (error) {
            supabaseAvailable = false;
        }

        const localCount = filterVisitsByTimeWindow((db.analytics?.visits || []).map(mapLocalVisit), { clearedAt }).length;
        const total = supabaseCount + localCount;
        res.json({ success: true, total, supabaseCount, localCount, supabaseAvailable });
    } catch (error) {
        reportServerError('Analytics Count Error', error);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics count' });
    }
});

// Settings - Clear Analytics
app.post('/api/settings/clear-analytics', validateAdminToken, async (req, res) => {
    try {
        const clearedAt = new Date().toISOString();
        let supabaseCleared = false;
        let supabaseErrorMessage = null;
        let deletedRows = 0;
        const hasSupabaseServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

        if (hasSupabaseServiceRole) {
            try {
                const beforeCount = await countSupabaseVisitors();
                await deleteSupabaseVisitorsInBatches();
                const afterCount = await countSupabaseVisitors();
                deletedRows = Math.max(0, beforeCount - afterCount);
                supabaseCleared = afterCount === 0;
                if (beforeCount > 0 && deletedRows === 0) {
                    throw new Error('Delete request completed but no Supabase rows were removed. Verify delete policy/permissions on visitors table.');
                }
            } catch (supabaseError) {
                supabaseErrorMessage = supabaseError.message || 'Supabase delete failed';
                console.warn('Supabase clear analytics partial:', supabaseErrorMessage);
                logNotification('warning', 'Partial Analytics Clear', `Supabase clear failed: ${supabaseErrorMessage}`);
            }
        } else {
            supabaseErrorMessage = 'Supabase hard delete skipped because SUPABASE_SERVICE_ROLE_KEY is not configured.';
        }

        const db = readDB();
        db.analytics = {
            visits: [],
            ip_logs: [],
            reelClicks: {},
            sessionDurations: {},
            profileOverrides: {},
            clearedAt,
            stats: {
                total_visitors: 0,
                unique_visitors: 0,
                countries: {},
                devices: { mobile: 0, desktop: 0 },
                average_session_seconds: 0
            }
        };
        writeDB(db);
        analyticsCache = { timestamp: 0, key: '', visits: [] };
        logNotification('info', 'Analytics Cleared', 'All analytics data was cleared');
        res.json({
            success: true,
            supabaseCleared,
            deletedRows,
            clearedAt,
            message: supabaseErrorMessage
                ? 'Analytics cleared locally. Supabase hard delete is unavailable without elevated delete permissions.'
                : 'Analytics data cleared successfully.'
        });
    } catch (error) {
        reportServerError('Analytics Clear Error', error, req);
        res.status(500).json({ error: 'Failed to clear analytics' });
    }
});

// Clean up rate limit store periodically
setInterval(() => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    for (const [key, requests] of memoryRateLimitStore.entries()) {
        const validRequests = requests.filter(time => time > windowStart);
        if (validRequests.length === 0) {
            memoryRateLimitStore.delete(key);
        } else {
            memoryRateLimitStore.set(key, validRequests);
        }
    }

    for (const [sessionId, session] of memorySessionStore.entries()) {
        if (!session?.expiresAt || session.expiresAt < now) {
            memorySessionStore.delete(sessionId);
        }
    }

    for (const [loginKey, state] of memoryLoginAttempts.entries()) {
        const staleByWindow = !state?.firstFailureAt || (now - state.firstFailureAt) > (LOGIN_LOCK_WINDOW_MS + LOGIN_LOCK_DURATION_MS);
        const staleByLock = state?.lockUntil && state.lockUntil < now - 60000;
        if (staleByWindow || staleByLock) {
            memoryLoginAttempts.delete(loginKey);
        }
    }

    for (const [ip, payload] of BLOCKED_IPS.entries()) {
        const blockedUntil = Number(payload?.blockedUntil ?? payload ?? 0);
        if (!blockedUntil || blockedUntil <= now) {
            unblockIp(ip);
        }
    }

    for (const [ip, state] of memoryRateLimitViolations.entries()) {
        if (!state?.lastSeenAt || (now - state.lastSeenAt) > RATE_LIMIT_VIOLATION_WINDOW_MS) {
            memoryRateLimitViolations.delete(ip);
        }
    }

    for (const [ip, state] of memoryMaliciousInputAttempts.entries()) {
        if (!state?.lastSeenAt || (now - state.lastSeenAt) > RATE_LIMIT_VIOLATION_WINDOW_MS) {
            memoryMaliciousInputAttempts.delete(ip);
        }
    }

    for (const [ip, cached] of geoDataCache.entries()) {
        if (!cached?.expiresAt || cached.expiresAt <= now) {
            geoDataCache.delete(ip);
        }
    }

    for (const [ip, ts] of memoryAppealSubmissions.entries()) {
        if (!ts || (now - ts) > APPEAL_MIN_INTERVAL_MS) {
            memoryAppealSubmissions.delete(ip);
        }
    }
}, 60000);

// Header Icon Upload + Variant Generation
app.post('/api/upload/header-icon', validateAdminToken, async (req, res) => {
    try {
        const { file, filename, type } = req.body;
        if (!file || !filename) return res.status(400).json({ error: 'File and filename required' });

        // Decode base64
        const base64Data = file.replace(/^data:image\/[a-zA-Z0-9+\-\.]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        let sharpLib = null;
        try {
            const imp = await import('sharp');
            sharpLib = imp.default || imp;
        } catch (err) {
            console.warn('Sharp not available, will fallback to uploading original file');
        }

        const sizes = [16, 32, 48, 64, 128, 180, 512];
        const variants = {};

        if (sharpLib) {
            for (const size of sizes) {
                try {
                    const pngBuffer = await sharpLib(buffer)
                        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .png({ quality: 90 })
                        .toBuffer();

                    const pngName = `header-${Date.now()}-${size}.png`;
                    const { error: upErr } = await supabase.storage.from('portfolio-images').upload(pngName, pngBuffer, { contentType: 'image/png', upsert: false });
                    if (!upErr) {
                        const { data: urlData } = supabase.storage.from('portfolio-images').getPublicUrl(pngName);
                        variants[`${size}px`] = urlData.publicUrl;
                    }

                    const webpBuffer = await sharpLib(buffer)
                        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .webp({ quality: 80 })
                        .toBuffer();

                    const webpName = `header-${Date.now()}-${size}.webp`;
                    const { error: upWErr } = await supabase.storage.from('portfolio-images').upload(webpName, webpBuffer, { contentType: 'image/webp', upsert: false });
                    if (!upWErr) {
                        const { data: webpUrlData } = supabase.storage.from('portfolio-images').getPublicUrl(webpName);
                        variants[`${size}px_webp`] = webpUrlData.publicUrl;
                    }
                } catch (innerErr) {
                    console.warn('Variant generation/upload failed for size', size, innerErr);
                }
            }
        } else {
            // Fallback: upload original file (SVG or raster)
            const ext = filename.split('.').pop() || 'svg';
            const uniqueName = `header-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
            const { data, error } = await supabase.storage
                .from('portfolio-images')
                .upload(uniqueName, buffer, { contentType: type || 'image/svg+xml' });

            if (error) {
                console.error('Supabase upload error:', error);
                return res.status(500).json({ error: 'Upload failed' });
            }
            const { data: urlData } = supabase.storage.from('portfolio-images').getPublicUrl(uniqueName);
            variants['original'] = urlData.publicUrl;
        }

        const defaultUrl = variants['180px'] || variants['128px'] || variants['original'] || Object.values(variants)[0];
        logNotification('info', 'Header Icon Uploaded', `Header icon uploaded: ${filename}`);
        res.json({ success: true, variants, defaultUrl });
    } catch (error) {
        console.error('Header upload error:', error);
        reportServerError('Header Icon Upload Error', error, req);
        res.status(500).json({ error: 'Header upload failed' });
    }
});

app.use((error, req, res, _next) => {
    reportServerError('Unhandled API Error', error, req);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Unexpected server error' });
});

// Handles any requests that don't match the API routes by sending back the main index.html file
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }

    if (!HAS_DIST) {
        return res.status(404).send('Frontend build not found. Run `npm run build` before starting the production server.');
    }

    res.sendFile(path.join(DIST_PATH, 'index.html'));
});

process.on('unhandledRejection', (reason) => {
    reportServerError('Unhandled Rejection', reason);
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    reportServerError('Uncaught Exception', error);
    console.error('Uncaught Exception:', error);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Security middleware active (rate limiting, input checks, security headers).');
    console.log('Health endpoint: /api/health');
    console.log(`Supabase URL: ${supabaseUrl}`);
    console.log(`Static build present: ${HAS_DIST}`);
    if (!REDIS_ENABLED) {
        console.log('Redis: disabled (set REDIS_URL to enable).');
    } else {
        console.log(`Redis status: ${redisStatus} (connected=${redisConnected})`);
    }
});
