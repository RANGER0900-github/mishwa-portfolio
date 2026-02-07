import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
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

const createAdminToken = () => {
    const token = 'admin-token-' + crypto.randomBytes(24).toString('hex');
    adminSessions.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
    return token;
};

const validateStoredToken = (token) => {
    if (!token || typeof token !== 'string') return false;
    if (!token.startsWith('admin-token-') || token.length < 28) return false;

    const expiresAt = adminSessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt < Date.now()) {
        adminSessions.delete(token);
        return false;
    }
    return true;
};

const purgeExpiredAdminSessions = () => {
    const now = Date.now();
    for (const [token, expiresAt] of adminSessions.entries()) {
        if (expiresAt < now) adminSessions.delete(token);
    }
};

// Rate limiting store
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const BLOCKED_IPS = new Set();
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const adminSessions = new Map();
let analyticsCache = { timestamp: 0, key: '', visits: [] };

const RATE_LIMIT_RULES = [
    { name: 'login', match: (req) => req.path === '/api/login', max: 10 },
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
        "default-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://ip-api.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none';"
    );
    next();
});

// Rate limiter
const rateLimiter = (req, res, next) => {
    const ip = getClientIP(req);

    if (BLOCKED_IPS.has(ip)) {
        logNotification('attack_blocked', 'Blocked IP Attempt', `Blocked request from banned IP: ${ip}`, ip);
        return res.status(403).json({ error: 'Access denied' });
    }

    const matchedRule = RATE_LIMIT_RULES.find((rule) => rule.match(req)) || RATE_LIMIT_RULES[RATE_LIMIT_RULES.length - 1];
    const key = `${ip}:${matchedRule.name}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    const requests = (rateLimitStore.get(key) || []).filter((time) => time > windowStart);
    requests.push(now);
    rateLimitStore.set(key, requests);

    if (requests.length > matchedRule.max) {
        logNotification('attack_blocked', 'Rate Limit Exceeded', `IP ${ip} exceeded rate limit`, ip);
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    next();
};

// Check if request is authenticated (has admin token)
const isAuthenticated = (req) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    return validateStoredToken(token);
};

// Input sanitizer - Smart version that allows common content
const sanitizeInput = (req, res, next) => {
    const ip = getClientIP(req);
    
    // Skip sanitization for authenticated admin requests and for /api/track endpoints
    const skipEndpoints = ['/api/track', '/api/track/heartbeat', '/api/track/reel', '/api/login'];
    if (isAuthenticated(req) || skipEndpoints.includes(req.path)) {
        return next();
    }
    
    const checkString = (str, path) => {
        if (typeof str !== 'string') return false;
        const matchedPattern = SECURITY_PATTERNS.find(pattern => {
            const isMatch = pattern.test(str);
            if (pattern.global) pattern.lastIndex = 0;
            return isMatch;
        });

        if (matchedPattern) {
            console.warn(`[SECURITY] Blocked suspicious input in ${path} from IP: ${ip}`);
            console.warn(`[SECURITY] Matched Pattern: ${matchedPattern}`);
            console.warn(`[SECURITY] Value: ${str.substring(0, 500)}`);
            logNotification('attack_blocked', 'Malicious Input Blocked', `Suspicious pattern detected in ${path} from IP: ${ip}`, ip);
            return true;
        }
        return false;
    };

    const checkObject = (obj, path = '') => {
        if (!obj || typeof obj !== 'object') return false;
        for (const key in obj) {
            const value = obj[key];
            const currentPath = path ? `${path}.${key}` : key;
            if (typeof value === 'string' && checkString(value, currentPath)) {
                return true;
            }
            if (typeof value === 'object' && value !== null) {
                if (checkObject(value, currentPath)) return true;
            }
        }
        return false;
    };

    // Only check body and query, skip params which might have URLs
    if (checkObject(req.body) || checkObject(req.query)) {
        return res.status(400).json({ error: 'Invalid input detected. Please avoid using script tags or known attack patterns.' });
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
        return { auth: {}, content: {}, analytics: { visits: [], reelClicks: {}, clearedAt: null }, notifications: [] };
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
    if (!db.analytics.clearedAt) db.analytics.clearedAt = null;
    writeDB(db);
};
initializeDB();

// Log notification helper
const logNotification = (type, title, message, ip = null) => {
    try {
        const db = readDB();
        if (!db.notifications) db.notifications = [];

        const notification = {
            id: crypto.randomUUID(),
            type,
            title,
            message,
            ip,
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

// Fetch geolocation
const fetchGeoData = async (ip) => {
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return {
            country: 'Localhost', city: 'Development Machine', region: 'Local',
            latitude: 0, longitude: 0, isp: 'Localhost',
            isVpn: false, connectionType: 'ethernet',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }
    try {
        const response = await fetch(`https://ip-api.com/json/${ip}?fields=status,message,country,city,regionName,lat,lon,isp,mobile,proxy,hosting,timezone`);
        const data = await response.json();
        if (data.status === 'success') {
            return {
                country: data.country || 'Unknown', city: data.city || 'Unknown',
                region: data.regionName || 'Unknown', latitude: data.lat || 0,
                longitude: data.lon || 0, isp: data.isp || 'Unknown',
                isVpn: data.proxy || data.hosting || false,
                connectionType: data.mobile ? 'cellular' : 'wifi',
                timezone: data.timezone || 'Unknown'
            };
        }
    } catch (error) {
        console.error('Geolocation API error:', error);
    }
    return { country: 'Unknown', city: 'Unknown', region: 'Unknown', latitude: 0, longitude: 0, isp: 'Unknown', isVpn: false, connectionType: 'unknown', timezone: 'Unknown' };
};

const getDeviceType = (userAgent) => {
    if (!userAgent) return 'unknown';
    if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) return 'mobile';
    return 'desktop';
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
    sessionDuration: Number(visit.session_duration || 0)
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
    sessionDuration: Number(visit.sessionDuration ?? visit.session_duration ?? 0)
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

const getCacheKey = (clearedAt) => clearedAt || 'all';

const fetchSupabaseVisits = async (clearedAt) => {
    const cacheKey = getCacheKey(clearedAt);
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

        if (clearedAt) {
            query = query.gte('created_at', clearedAt);
        }

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
// TOKEN VALIDATION MIDDLEWARE
// =====================

// Validate admin token
const validateAdminToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token || req.query?.token;
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    if (!validateStoredToken(token)) {
        return res.status(401).json({ success: false, message: 'Session expired or invalid token' });
    }
    
    // Store validated token in request
    req.adminToken = token;
    next();
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
        hasSupabaseKey: Boolean(supabaseKey)
    });
});

// Get Content
app.get('/api/content', (req, res) => {
    try {
        const db = readDB();
        res.json(db.content);
    } catch (error) {
        logNotification('error', 'Content Read Error', error.message);
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

        db.content = { ...db.content, ...content };
        writeDB(db);
        logNotification('info', 'Content Updated', 'Website content was modified via CMS');
        res.json({ success: true, content: db.content });
    } catch (error) {
        console.error('Content update error:', error);
        logNotification('error', 'Content Update Error', error.message);
        res.status(500).json({ error: 'Failed to update content' });
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
        logNotification('error', 'Upload Error', error.message);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Login with security logging
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const ip = getClientIP(req);

        // Validate input
        if (!validateUsername(username) || !validatePassword(password)) {
            logNotification('warning', 'Invalid Login Attempt', `Invalid credentials format from IP: ${ip}`, ip);
            return res.status(400).json({ success: false, message: 'Invalid credentials format' });
        }

        const db = readDB();

        // Compare password with hash
        const passwordMatch = await bcrypt.compare(password, db.auth.passwordHash || '');

        if (username === db.auth.username && passwordMatch) {
            const token = createAdminToken();
            logNotification('security', 'Login Success', `Admin login from IP: ${ip}`, ip);
            res.json({ success: true, token, expiresInMs: ADMIN_TOKEN_TTL_MS });
        } else {
            logNotification('warning', 'Failed Login Attempt', `Failed login attempt from IP: ${ip} with username: ${username}`, ip);
            res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Validate Token
app.post('/api/validate-token', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token;
    
    if (!validateStoredToken(token)) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    res.json({ success: true, valid: true });
});

app.post('/api/logout', validateAdminToken, (req, res) => {
    adminSessions.delete(req.adminToken);
    res.json({ success: true });
});

// Track Visitor
app.post('/api/track', async (req, res) => {
    try {
        const { userAgent, pageViewed, reelId } = req.body;
        const clientIP = getClientIP(req);
        const geoData = await fetchGeoData(clientIP);
        const deviceType = getDeviceType(userAgent);

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

        // Prevent duplicate rapid-fire visits from same IP within 60 seconds
        const now = Date.now();
        const recentWindow = 60 * 1000; // 60 seconds

        // Check local fallback DB first for recent visit
        const db = readDB();
        if (!db.analytics) db.analytics = { visits: [], reelClicks: {} };
        const recentLocal = db.analytics.visits.find(v => v.ip === clientIP && (now - new Date(v.timestamp).getTime()) < recentWindow);
        if (recentLocal) {
            // Update pageViewed if new
            recentLocal.page_viewed = pageViewed || recentLocal.page_viewed;
            writeDB(db);
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
            if (latestVisit && (now - new Date(latestVisit.created_at).getTime()) < (30 * 60 * 1000)) {
                if (pageViewed && pageViewed !== latestVisit.page_viewed) {
                    await supabase.from('visitors').update({ page_viewed: pageViewed }).eq('id', latestVisit.id);
                }
                return res.json({ success: true, visitId: latestVisit.id, source: 'supabase_recent' });
            }

            const { data, error } = await supabase.from('visitors').insert([visitorData]).select().single();
            if (error || !data) throw error || new Error('No data');
            return res.json({ success: true, visitId: data.id, source: 'supabase' });
        } catch (err) {
            // Supabase failed or not configured — store locally but avoid duplicates
            const localVisit = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...visitorData };
            db.analytics.visits.push(localVisit);
            // Keep list length limited
            if (db.analytics.visits.length > 2000) db.analytics.visits = db.analytics.visits.slice(-2000);
            writeDB(db);
            return res.json({ success: true, visitId: localVisit.id, source: 'local' });
        }
    } catch (error) {
        console.error("Tracking Error:", error);
        res.json({ success: false });
    }
});

// Session Heartbeat
app.post('/api/track/heartbeat', async (req, res) => {
    try {
        const visitId = req.body?.visitId;
        const duration = Math.max(0, Number(req.body?.duration) || 0);
        if (!visitId) return res.json({ success: false });

        const { error } = await supabase.from('visitors').update({ session_duration: duration }).eq('id', visitId);

        if (error) {
            const db = readDB();
            const idx = db.analytics.visits.findIndex(v => v.id === visitId);
            if (idx !== -1) {
                db.analytics.visits[idx].session_duration = duration;
                writeDB(db);
            }
        }
        res.json({ success: true });
    } catch (error) {
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
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// Get Analytics with pagination
app.get('/api/analytics', validateAdminToken, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const db = readDB();
        const clearedAt = db.analytics?.clearedAt || null;
        let allVisits = [];

        try {
            allVisits = await fetchSupabaseVisits(clearedAt);
        } catch (supabaseError) {
            console.warn('Supabase analytics fetch failed, using local fallback:', supabaseError.message);
            allVisits = (db.analytics?.visits || []).map(mapLocalVisit);
            if (clearedAt) {
                allVisits = allVisits.filter((visit) => visit.timestamp && visit.timestamp >= clearedAt);
            }
        }

        allVisits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const visits = allVisits.slice(offset, offset + limit);
        const total = allVisits.length;
        const stats = buildAnalyticsStats(allVisits);

        res.json({
            visits,
            pagination: { page, limit, total },
            reelClicks: db.analytics?.reelClicks || {},
            stats
        });
    } catch (error) {
        console.error('Analytics fetch error:', error);
        const db = readDB();
        const visits = (db.analytics?.visits || []).map(mapLocalVisit);
        res.json({
            visits,
            pagination: { page: 1, limit: visits.length || 50, total: visits.length },
            reelClicks: db.analytics?.reelClicks || {},
            stats: buildAnalyticsStats(visits)
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
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// Settings - Clear Analytics
app.post('/api/settings/clear-analytics', validateAdminToken, async (req, res) => {
    try {
        const clearedAt = new Date().toISOString();
        let supabaseCleared = false;
        let supabaseErrorMessage = null;

        try {
            const { error } = await supabase.from('visitors').delete().not('id', 'is', null);
            if (error) throw error;
            supabaseCleared = true;
        } catch (supabaseError) {
            supabaseErrorMessage = supabaseError.message || 'Supabase delete failed';
            console.warn('Supabase clear analytics failed:', supabaseErrorMessage);
            logNotification('warning', 'Partial Analytics Clear', `Supabase clear failed: ${supabaseErrorMessage}`);
        }

        const db = readDB();
        db.analytics = {
            visits: [],
            ip_logs: [],
            reelClicks: {},
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
            clearedAt,
            message: supabaseErrorMessage ? 'Analytics cleared locally and hidden from dashboard. Supabase rows may require elevated key to hard-delete.' : 'Analytics data cleared successfully.'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear analytics' });
    }
});

// Clean up rate limit store periodically
setInterval(() => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    for (const [ip, requests] of rateLimitStore.entries()) {
        const validRequests = requests.filter(time => time > windowStart);
        if (validRequests.length === 0) {
            rateLimitStore.delete(ip);
        } else {
            rateLimitStore.set(ip, validRequests);
        }
    }
    purgeExpiredAdminSessions();
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
        logNotification('error', 'Header Icon Upload Error', error.message);
        res.status(500).json({ error: 'Header upload failed' });
    }
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Security middleware active (rate limiting, input checks, security headers).');
    console.log('Health endpoint: /api/health');
    console.log(`Supabase URL: ${supabaseUrl}`);
    console.log(`Static build present: ${HAS_DIST}`);
});
