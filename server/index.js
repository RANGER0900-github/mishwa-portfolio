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
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kgramjutjldqiabjzrih.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

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
    return password.length >= 6;
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

// Rate limiting store
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window
const BLOCKED_IPS = new Set();

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
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Rate limiter
const rateLimiter = (req, res, next) => {
    const ip = getClientIP(req);

    if (BLOCKED_IPS.has(ip)) {
        logNotification('attack_blocked', 'Blocked IP Attempt', `Blocked request from banned IP: ${ip}`, ip);
        return res.status(403).json({ error: 'Access denied' });
    }

    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;

    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, []);
    }

    const requests = rateLimitStore.get(ip).filter(time => time > windowStart);
    requests.push(now);
    rateLimitStore.set(ip, requests);

    if (requests.length > RATE_LIMIT_MAX) {
        logNotification('attack_blocked', 'Rate Limit Exceeded', `IP ${ip} exceeded rate limit`, ip);
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    next();
};

// Check if request is authenticated (has admin token)
const isAuthenticated = (req) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) return false;
    // Tokens start with 'admin-token-' that we generate in login
    return token.startsWith('admin-token-') && token.length > 20;
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

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(rateLimiter);
app.use(sanitizeInput);

// Helper to read/write local DB
const readDB = () => {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
        return { auth: {}, content: {}, analytics: { visits: [], notifications: [] } };
    }
};
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Initialize notifications array if not exists
const initializeDB = () => {
    const db = readDB();
    if (!db.notifications) db.notifications = [];
    if (!db.analytics) db.analytics = { visits: [], reelClicks: {} };
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
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,regionName,lat,lon,isp,mobile,proxy,hosting,timezone`);
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

// =====================
// TOKEN VALIDATION MIDDLEWARE
// =====================

// Validate admin token
const validateAdminToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token || req.query?.token;
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    // Token should start with "admin-token-"
    if (!token.startsWith('admin-token-')) {
        return res.status(401).json({ success: false, message: 'Invalid token format' });
    }
    
    // Token should be 48+ characters (12 for prefix + 16 for random bytes in hex)
    if (token.length < 28) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    // Store validated token in request
    req.adminToken = token;
    next();
};

// =====================
// API ROUTES
// =====================

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
        const baseUrl = 'https://mishwa.portfolio.com';
        
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
    const robotsTxt = `User-agent: *
Allow: /

Sitemap: https://mishwa.portfolio.com/sitemap.xml
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
app.post('/api/upload', async (req, res) => {
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
            logNotification('security', 'Login Success', `Admin login from IP: ${ip}`, ip);
            res.json({ success: true, token: 'admin-token-' + crypto.randomBytes(16).toString('hex') });
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
    
    if (!token || !token.startsWith('admin-token-') || token.length < 28) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    res.json({ success: true, valid: true });
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
        const { visitId, duration } = req.body;
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
app.get('/api/analytics', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;

        const { data: supabaseVisits, error } = await supabase
            .from('visitors')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const db = readDB();

        const visits = (supabaseVisits || []).map(v => ({
            id: v.id, timestamp: v.created_at, ip: v.ip, userAgent: v.user_agent,
            deviceType: v.device_type, country: v.country, city: v.city,
            region: v.region, latitude: v.latitude, longitude: v.longitude,
            isp: v.isp, isVpn: v.is_vpn, connectionType: v.connection_type,
            timezone: v.timezone, pageViewed: v.page_viewed, reelId: v.reel_id,
            sessionDuration: v.session_duration
        }));

        const total = visits.length;
        const unique = new Set(visits.map(v => v.ip)).size;
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = visits.filter(v => v.timestamp?.startsWith(today)).length;

        const countries = {};
        visits.forEach(v => { if (v.country) countries[v.country] = (countries[v.country] || 0) + 1; });

        const devices = { mobile: 0, desktop: 0 };
        visits.forEach(v => { if (v.deviceType === 'mobile') devices.mobile++; else devices.desktop++; });

        res.json({
            visits,
            pagination: { page, limit, total: limit },
            reelClicks: db.analytics?.reelClicks || {},
            stats: { total_visitors: total, unique_visitors: unique, today: todayCount, countries, devices }
        });
    } catch (error) {
        console.error('Analytics fetch error:', error);
        const db = readDB();
        res.json(db.analytics || { visits: [], reelClicks: {} });
    }
});

// =====================
// NOTIFICATIONS API
// =====================

app.get('/api/notifications', (req, res) => {
    try {
        const db = readDB();
        res.json({ notifications: db.notifications || [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.post('/api/notifications/:id/read', (req, res) => {
    try {
        const db = readDB();
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

app.delete('/api/notifications/:id', (req, res) => {
    try {
        const db = readDB();
        db.notifications = db.notifications.filter(n => n.id !== req.params.id);
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

app.post('/api/notifications/clear', (req, res) => {
    try {
        const db = readDB();
        db.notifications = [];
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

// Settings - Update Password
app.post('/api/settings/password', async (req, res) => {
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
app.post('/api/settings/clear-analytics', async (req, res) => {
    try {
        await supabase.from('visitors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const db = readDB();
        db.analytics = { visits: [], ip_logs: [], reelClicks: {}, stats: { total_visitors: 0, unique_visitors: 0, countries: {}, devices: { mobile: 0, desktop: 0 } } };
        writeDB(db);
        logNotification('info', 'Analytics Cleared', 'All analytics data was cleared');
        res.json({ success: true });
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
}, 60000);

// Header Icon Upload + Variant Generation
app.post('/api/upload/header-icon', async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔒 Security middleware active (rate limiting, XSS protection)`);
    console.log(`📊 Analytics API: /api/analytics`);
    console.log(`🔔 Notifications API: /api/notifications`);
    console.log(`🌐 Supabase connected: ${supabaseUrl}`);
});
