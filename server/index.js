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
const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseKey);

// Useful for local E2E debugging: keep analytics traffic out of Supabase.
const ANALYTICS_STORAGE_MODE = String(process.env.ANALYTICS_STORAGE_MODE || '').trim().toLowerCase();
const SUPABASE_ANALYTICS_DISABLED =
    ANALYTICS_STORAGE_MODE === 'local' ||
    String(process.env.DISABLE_SUPABASE_ANALYTICS || '').trim().toLowerCase() === 'true';
const SUPABASE_ANALYTICS_ENABLED = SUPABASE_CONFIGURED && !SUPABASE_ANALYTICS_DISABLED;

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
// Allow overriding DB path for local debugging / E2E runs (keeps repo DB clean).
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, 'data', 'db.json');
const DIST_PATH = path.join(__dirname, '..', 'dist');
const HAS_DIST = fs.existsSync(DIST_PATH);
const INDEX_HTML_PATH = path.join(DIST_PATH, 'index.html');
const INDEX_HTML_TEMPLATE = HAS_DIST ? fs.readFileSync(INDEX_HTML_PATH, 'utf8') : '';

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

const slugify = (value, { maxLength = 80 } = {}) => {
    const raw = sanitizeString(String(value || ''), 200).toLowerCase();
    const cleaned = raw
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned.slice(0, maxLength).replace(/-+$/g, '');
};

const isValidSlug = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const ensureProjectSlugs = (content) => {
    if (!content?.projects || !Array.isArray(content.projects)) return { content, changed: false };
    const used = new Set();
    let changed = false;

    content.projects = content.projects.map((project) => {
        if (!project || typeof project !== 'object') return project;
        const idSuffix = project.id ? `-${project.id}` : '';
        let slug = project.slug && isValidSlug(project.slug) ? project.slug : slugify(project.title || `project${idSuffix}`);
        if (!slug) slug = `project${idSuffix || ''}`.replace(/^-/, '');

        let candidate = slug;
        if (used.has(candidate)) {
            candidate = `${candidate}${idSuffix}`;
        }
        if (!candidate || used.has(candidate)) {
            candidate = `${slug || 'project'}${idSuffix || `-${crypto.randomUUID().slice(0, 8)}`}`;
        }

        used.add(candidate);
        if (project.slug !== candidate) {
            changed = true;
            return { ...project, slug: candidate };
        }
        return project;
    });

    return { content, changed };
};

const buildProjectSeoDescription = (project = {}) => {
    const title = sanitizeString(project.title || 'Project', 120);
    const category = sanitizeString(project.category || 'Video Editing', 80);
    return sanitizeString(
        `${title} is a ${category.toLowerCase()} project from ${SEO_OWNER_NAME}, a ${SEO_LOCATION}-based video editor focused on high-retention reels and cinematic storytelling.`,
        180
    );
};

const ensureProjectSeoFields = (content) => {
    if (!content?.projects || !Array.isArray(content.projects)) return { content, changed: false };
    let changed = false;

    content.projects = content.projects.map((project) => {
        if (!project || typeof project !== 'object') return project;
        const currentDescription = sanitizeString(project.seoDescription || '', 180);
        if (currentDescription) {
            if (project.seoDescription !== currentDescription) {
                changed = true;
                return { ...project, seoDescription: currentDescription };
            }
            return project;
        }

        changed = true;
        return { ...project, seoDescription: buildProjectSeoDescription(project) };
    });

    return { content, changed };
};

const sanitizeSeoFaqItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const q = sanitizeString(item.q || item.question || '', 180);
            const a = sanitizeString(item.a || item.answer || '', 500);
            if (!q || !a) return null;
            return { q, a };
        })
        .filter(Boolean)
        .slice(0, 12);
};

const buildDefaultSeoHubEntries = (content, type) => {
    const projects = Array.isArray(content?.projects) ? content.projects : [];
    const projectSlugs = projects
        .map((project) => (project?.slug && isValidSlug(project.slug) ? project.slug : slugify(project?.title || '')))
        .filter(Boolean);

    const baseFaqs = [
        { q: 'Can you edit for Instagram Reels?', a: 'Yes. I edit retention-focused reels with strong hooks, pacing, and story payoff.' },
        { q: 'Do you work with brands outside Surat?', a: 'Yes. I collaborate remotely with creators and brands across India and international markets.' },
        { q: 'Do you provide revisions?', a: 'Yes. Revision rounds are included based on project scope and deliverables.' }
    ];

    const serviceTitles = [
        'Instagram Reels Editing Service',
        'Brand Storytelling Video Editing',
        'Short-Form Ad Creative Editing',
        'Creator Content Retention Editing',
        'Cinematic Lifestyle Edit Service',
        'Product Reel Editing Service',
        'Travel Reel Editing Service',
        'Food & Beverage Reel Editing Service'
    ];

    const guideTitles = [
        'How to Improve Reel Retention in 30 Seconds',
        'Hook and Payoff Editing Structure for Instagram Reels',
        'Cinematic Storytelling for Short Form Video',
        'Cutting Patterns That Improve Watch Time',
        'How to Build Brand-Consistent Reel Edits',
        'Sound Design Basics for Reels',
        'Color and Contrast Workflow for Mobile-First Videos',
        'How to Plan Reels for Better Conversion'
    ];

    if (type === 'services') {
        return serviceTitles.map((title, index) => ({
            id: `services-${index + 1}`,
            slug: slugify(title),
            title,
            excerpt: `${title} by ${SEO_OWNER_NAME} for brands and creators seeking high-retention short-form video outcomes.`,
            primaryKeyword: title.toLowerCase(),
            secondaryKeywords: ['surat video editor', 'high retention reels editor', 'cinematic editing'],
            intro: `${SEO_OWNER_NAME} delivers ${title.toLowerCase()} with retention-focused pacing, story clarity, and social-first visual flow.`,
            sections: [
                {
                    heading: 'What this service includes',
                    body: 'Story selection, hook optimization, pacing design, sound layering, and export optimization for platform-native performance.'
                },
                {
                    heading: 'Who this is best for',
                    body: 'Creators, brands, and agencies that need consistent short-form edits with measurable watch-time improvements.'
                }
            ],
            faqs: baseFaqs,
            relatedProjectSlugs: projectSlugs.slice(index, index + 2),
            heroImage: projects[index % Math.max(1, projects.length)]?.image || '',
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            indexable: true
        }));
    }

    if (type === 'caseStudies') {
        const selectedProjects = projects.slice(0, 8);
        return selectedProjects.map((project, index) => ({
            id: `case-study-${index + 1}`,
            slug: slugify(`${project.title || `project-${index + 1}`} case study`),
            title: `${project.title || `Project ${index + 1}`} Case Study`,
            excerpt: `Case study for ${project.title || `Project ${index + 1}`}: edit strategy, visual pacing, and retention-focused storytelling decisions.`,
            primaryKeyword: `${project.title || 'video'} case study`,
            secondaryKeywords: [project.category || 'video editing', 'short form editing workflow', 'reel editing strategy'],
            intro: `A detailed case study for ${project.title || `Project ${index + 1}`} covering structure, pacing, and final narrative outcome.`,
            sections: [
                {
                    heading: 'Project brief and challenge',
                    body: `Initial objective: improve attention and clarity for ${project.category || 'short-form content'} while preserving brand tone and visual consistency.`
                },
                {
                    heading: 'Editing framework and execution',
                    body: 'Applied hook optimization, rhythm cuts, sound emphasis, and scene progression to improve watch continuity and conversion intent.'
                },
                {
                    heading: 'Outcome and learnings',
                    body: 'The project demonstrates how structured storytelling and editing tempo can improve both audience retention and content memorability.'
                }
            ],
            faqs: baseFaqs,
            relatedProjectSlugs: [project.slug].filter(Boolean),
            heroImage: project.image || '',
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            indexable: true
        }));
    }

    return guideTitles.map((title, index) => ({
        id: `guide-${index + 1}`,
        slug: slugify(title),
        title,
        excerpt: `${title} from ${SEO_OWNER_NAME}: practical methods for better short-form storytelling and retention-driven edits.`,
        primaryKeyword: title.toLowerCase(),
        secondaryKeywords: ['video editing tips', 'instagram reels strategy', 'retention editing guide'],
        intro: `${title} explains practical editing tactics used in real client and creator projects.`,
        sections: [
            {
                heading: 'Key principle',
                body: 'Prioritize viewer orientation in the first seconds, then establish clear visual progression to sustain watch behavior.'
            },
            {
                heading: 'Execution checklist',
                body: 'Use hook preview, pacing transitions, subtitle hierarchy, and intentional sound design to maintain continuity and reduce drop-off.'
            }
        ],
        faqs: baseFaqs,
        relatedProjectSlugs: projectSlugs.slice(index, index + 2),
        heroImage: projects[index % Math.max(1, projects.length)]?.image || '',
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        indexable: true
    }));
};

const ensureSeoHubContent = (content) => {
    if (!content || typeof content !== 'object') return { content, changed: false };

    const nextContent = content;
    const seo = nextContent.seo && typeof nextContent.seo === 'object' ? { ...nextContent.seo } : {};
    const hubTypes = Object.keys(SEO_HUB_ROUTE_CONFIG);
    let changed = !nextContent.seo || typeof nextContent.seo !== 'object';

    const ensureHubList = (type) => {
        const fromDb = Array.isArray(seo[type]) ? seo[type] : [];
        if (!Array.isArray(seo[type])) changed = true;
        const source = fromDb.length > 0 ? fromDb : buildDefaultSeoHubEntries(nextContent, type);
        if (fromDb.length === 0 && source.length > 0) changed = true;

        const used = new Set();
        const normalized = source.map((entry, index) => {
            const safe = entry && typeof entry === 'object' ? entry : {};
            const title = sanitizeString(safe.title || `${SEO_HUB_ROUTE_CONFIG[type].singular} ${index + 1}`, 140);
            let slug = isValidSlug(safe.slug) ? safe.slug : slugify(safe.slug || title || `${type}-${index + 1}`);
            if (!slug) slug = `${type}-${index + 1}`;
            while (used.has(slug)) slug = `${slug}-${index + 1}`;
            used.add(slug);

            const normalizedEntry = {
                id: sanitizeString(safe.id || `${type}-${slug}`, 120),
                slug,
                title,
                excerpt: sanitizeString(safe.excerpt || '', 220),
                primaryKeyword: sanitizeString(safe.primaryKeyword || '', 120),
                secondaryKeywords: Array.isArray(safe.secondaryKeywords)
                    ? safe.secondaryKeywords.map((value) => sanitizeString(value, 120)).filter(Boolean).slice(0, 20)
                    : [],
                intro: sanitizeString(safe.intro || '', 450),
                sections: Array.isArray(safe.sections)
                    ? safe.sections
                        .map((section) => {
                            if (!section || typeof section !== 'object') return null;
                            const heading = sanitizeString(section.heading || '', 120);
                            const body = sanitizeString(section.body || '', 1200);
                            if (!heading || !body) return null;
                            return { heading, body };
                        })
                        .filter(Boolean)
                        .slice(0, 14)
                    : [],
                faqs: sanitizeSeoFaqItems(safe.faqs),
                relatedProjectSlugs: Array.isArray(safe.relatedProjectSlugs)
                    ? safe.relatedProjectSlugs.map((value) => slugify(value, { maxLength: 80 })).filter(Boolean).slice(0, 20)
                    : [],
                heroImage: sanitizeString(safe.heroImage || '', 600),
                publishedAt: sanitizeString(safe.publishedAt || '', 60),
                updatedAt: sanitizeString(safe.updatedAt || '', 60),
                indexable: safe.indexable !== false
            };

            if (JSON.stringify(normalizedEntry) !== JSON.stringify(safe)) {
                changed = true;
            }

            return normalizedEntry;
        });

        seo[type] = normalized;
    };

    for (const type of hubTypes) {
        ensureHubList(type);
    }

    const defaultFaqs = [
        { q: 'Do you edit Instagram Reels?', a: 'Yes, with retention-focused pacing, hook clarity, and social-first storytelling.' },
        { q: 'Are remote projects supported?', a: 'Yes. Projects are handled remotely with streamlined review and feedback cycles.' },
        { q: 'Can I request revisions?', a: 'Yes. Revision rounds are available based on scope and project agreement.' }
    ];
    const normalizedFaqs = sanitizeSeoFaqItems(seo.faqs);
    const finalFaqs = normalizedFaqs.length > 0 ? normalizedFaqs : defaultFaqs;
    if (!Array.isArray(seo.faqs) || JSON.stringify(finalFaqs) !== JSON.stringify(seo.faqs)) {
        seo.faqs = finalFaqs;
        changed = true;
    }

    if (changed) {
        nextContent.seo = seo;
    }

    return { content: nextContent, changed };
};

const normalizePublicSiteUrl = (value) => {
    const raw = sanitizeString(String(value || ''), 300);
    if (!raw) return '';
    const withProto = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    return withProto.replace(/\/+$/, '');
};

const getRequestBaseUrl = (req) => {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = forwardedHost || req.get('host') || '';
    return normalizePublicSiteUrl(`${proto}://${host}`);
};

const getPreferredPublicBaseUrl = (req) => {
    const configuredBase = normalizePublicSiteUrl(process.env.PUBLIC_SITE_URL || process.env.PUBLIC_BASE_URL);
    const requestBase = getRequestBaseUrl(req);

    if (!configuredBase) return requestBase;
    if (!requestBase) return configuredBase;

    try {
        const configuredHost = new URL(configuredBase).host.toLowerCase();
        const requestHost = new URL(requestBase).host.toLowerCase();
        const strictConfigured = String(process.env.PUBLIC_SITE_URL_STRICT || '').toLowerCase() === 'true';

        if (!strictConfigured && configuredHost !== requestHost) {
            return requestBase;
        }
    } catch {
        return configuredBase;
    }

    return configuredBase;
};

const SEO_OWNER_NAME = sanitizeString(process.env.SEO_OWNER_NAME || 'Mishwa Zalavadiya', 120);
const SEO_BRAND_NAME = sanitizeString(process.env.SEO_BRAND_NAME || 'Mishwa', 80);
const SEO_SITE_NAME = sanitizeString(process.env.SEO_SITE_NAME || `${SEO_BRAND_NAME} Portfolio`, 140);
const SEO_LOCATION = sanitizeString(process.env.SEO_LOCATION || 'Surat, Gujarat, India', 140);
const SEO_DEFAULT_INSTAGRAM_URL = sanitizeString(process.env.SEO_INSTAGRAM_URL || 'https://www.instagram.com/_thecoco_club/', 260);
const SEO_DEFAULT_IMAGE_PATH = sanitizeString(process.env.SEO_DEFAULT_IMAGE || '/my-logo-circle.png', 260) || '/my-logo-circle.png';
const SEO_PRIMARY_BRAND_ROUTE = sanitizeString(process.env.SEO_PRIMARY_BRAND_ROUTE || '/', 80) || '/';
const SEO_INDEX_REELS = String(process.env.SEO_INDEX_REELS || 'true').trim().toLowerCase() !== 'false';
const SEO_ENABLE_CONTENT_HUB = String(process.env.SEO_ENABLE_CONTENT_HUB || 'true').trim().toLowerCase() !== 'false';
const SEO_ENABLE_BREADCRUMB_SCHEMA = String(process.env.SEO_ENABLE_BREADCRUMB_SCHEMA || 'true').trim().toLowerCase() !== 'false';
const buildSeoKeywordUniverse = () => {
    const brandTerms = [
        'Mishwa',
        'Mishwa Zalavadiya',
        'Mishwa portfolio',
        'Mishwa video editor',
        'Mishwa Zalavadiya portfolio',
        'Mishwa Zalavadiya video editor',
        'Mishwa Zalavadiya Instagram editor',
        'Mishwa editor',
        'Mishwa reels editor',
        'Mishwa cinematic editor',
        'Mishwa content editor'
    ];
    const serviceTerms = [
        'video editor',
        'video editing',
        'video editor portfolio',
        'best video editor',
        'professional video editor',
        'freelance video editor',
        'Instagram video editor',
        'Instagram Reels editor',
        'short form video editor',
        'social media video editor',
        'cinematic video editor',
        'retention video editor',
        'high retention reels editor',
        'brand storytelling editor',
        'short video editor',
        'youtube shorts editor',
        'tiktok style editor',
        'ugc video editor',
        'ad video editor',
        'commercial video editor',
        'event video editor',
        'wedding reel editor',
        'fashion reel editor',
        'food reel editor',
        'real estate reel editor',
        'ecommerce video editor',
        'podcast clips editor',
        'viral reels editor'
    ];
    const locationTerms = [
        'India',
        'Pan India',
        'All India',
        'Surat',
        'Ankleshwar',
        'Ahmedabad',
        'Vadodara',
        'Rajkot',
        'Bhavnagar',
        'Jamnagar',
        'Junagadh',
        'Gandhinagar',
        'Bharuch',
        'Navsari',
        'Valsad',
        'Vapi',
        'Nadiad',
        'Anand',
        'Mehsana',
        'Palanpur',
        'Bhuj',
        'Porbandar',
        'Gujarat',
        'Mumbai',
        'Pune',
        'Nagpur',
        'Nashik',
        'Thane',
        'Aurangabad',
        'Maharashtra',
        'Delhi',
        'New Delhi',
        'Noida',
        'Gurgaon',
        'Faridabad',
        'Ghaziabad',
        'Uttar Pradesh',
        'Lucknow',
        'Kanpur',
        'Varanasi',
        'Prayagraj',
        'Agra',
        'Meerut',
        'Bihar',
        'Patna',
        'Gaya',
        'Jharkhand',
        'Ranchi',
        'Jamshedpur',
        'West Bengal',
        'Kolkata',
        'Howrah',
        'Durgapur',
        'Siliguri',
        'Odisha',
        'Bhubaneswar',
        'Cuttack',
        'Rourkela',
        'Assam',
        'Guwahati',
        'Punjab',
        'Chandigarh',
        'Ludhiana',
        'Amritsar',
        'Jalandhar',
        'Rajasthan',
        'Jaipur',
        'Jodhpur',
        'Udaipur',
        'Kota',
        'Ajmer',
        'Madhya Pradesh',
        'Indore',
        'Bhopal',
        'Gwalior',
        'Jabalpur',
        'Chhattisgarh',
        'Raipur',
        'Bhilai',
        'Haryana',
        'Panipat',
        'Karnal',
        'Himachal Pradesh',
        'Shimla',
        'Uttarakhand',
        'Dehradun',
        'Haridwar',
        'Jammu and Kashmir',
        'Srinagar',
        'Jammu',
        'Ladakh',
        'Leh',
        'Telangana',
        'Hyderabad',
        'Warangal',
        'Andhra Pradesh',
        'Visakhapatnam',
        'Vijayawada',
        'Guntur',
        'Kurnool',
        'Tamil Nadu',
        'Chennai',
        'Coimbatore',
        'Madurai',
        'Salem',
        'Tiruchirappalli',
        'Kerala',
        'Kochi',
        'Thiruvananthapuram',
        'Kozhikode',
        'Kannur',
        'Karnataka',
        'Bengaluru',
        'Mysuru',
        'Mangalore',
        'Hubli',
        'Belgaum',
        'Goa',
        'Panaji',
        'North Goa',
        'South Goa',
        'Puducherry',
        'Pondicherry'
    ];
    const intentTerms = [
        'portfolio',
        'services',
        'hire',
        'expert',
        'creator',
        'for brands',
        'for creators',
        'for Instagram growth',
        'near me',
        'online',
        'remote',
        'agency',
        'freelancer',
        'for business',
        'for startups',
        'for ecommerce',
        'for influencers',
        'for coaches',
        'for creators in india'
    ];
    const explicitHighIntent = [
        'mishwa zalavadiya video editor surat',
        'mishwa zalaydiya video editor surat',
        'mishwa zalavadia video editor surat',
        'mishwa zalavadiya instagram video editor',
        'mishwa zalaydiya instagram video editor',
        'mishwa zalavadiya reels editor',
        'mishwa video editor surat',
        'mishwa surat portfolio',
        'mishwa ankleshwar video editor',
        'best video editor surat',
        'best instagram reels editor surat',
        'instagram video editor mishwa zalavadiya',
        'video editor ankleshwar',
        'instagram reels editor ankleshwar',
        'video editor india mishwa zalavadiya'
    ];

    const keywords = new Set(explicitHighIntent.map((value) => value.trim()));

    for (const brand of brandTerms) {
        keywords.add(brand);
        for (const service of serviceTerms) {
            keywords.add(`${brand} ${service}`);
            keywords.add(`${service} ${brand}`);
        }
        for (const location of locationTerms) {
            keywords.add(`${brand} ${location}`);
            keywords.add(`${brand} portfolio ${location}`);
        }
    }

    for (const service of serviceTerms) {
        keywords.add(service);
        for (const location of locationTerms) {
            keywords.add(`${service} ${location}`);
            keywords.add(`best ${service} ${location}`);
            keywords.add(`hire ${service} ${location}`);
        }
        for (const intent of intentTerms) {
            keywords.add(`${service} ${intent}`);
            keywords.add(`${intent} ${service}`);
        }
    }

    for (const brand of brandTerms) {
        for (const service of serviceTerms) {
            for (const location of locationTerms) {
                keywords.add(`${brand} ${service} ${location}`);
                keywords.add(`${service} ${brand} ${location}`);
                keywords.add(`hire ${brand} ${service} ${location}`);
                keywords.add(`best ${brand} ${service} ${location}`);
                keywords.add(`${brand} ${location} ${service}`);
            }
        }
    }

    for (const location of locationTerms) {
        keywords.add(`video editor in ${location}`);
        keywords.add(`best video editor in ${location}`);
        keywords.add(`instagram reels editor in ${location}`);
        keywords.add(`freelance video editor in ${location}`);
        keywords.add(`cinematic video editor in ${location}`);
        keywords.add(`mishwa zalavadiya ${location}`);
        keywords.add(`mishwa video editor ${location}`);
        keywords.add(`mishwa zalavadiya video editor ${location}`);
    }

    return Array.from(keywords).slice(0, 15000);
};

const SEO_DEFAULT_KEYWORDS = buildSeoKeywordUniverse();
const SEO_META_KEYWORD_LIMIT = Math.max(120, Math.min(600, Number.parseInt(process.env.SEO_META_KEYWORD_LIMIT || '250', 10) || 250));
const SEO_LANDING_PAGES = Object.freeze({
    '/mishwa-zalavadiya-video-editor-portfolio': {
        title: `${SEO_OWNER_NAME} Video Editor Portfolio | ${SEO_LOCATION}`,
        description: `${SEO_OWNER_NAME} is a ${SEO_LOCATION}-based video editor specializing in high-retention Instagram Reels, ad creatives, and cinematic storytelling edits for clients across India, including Ankleshwar.`,
        keywords: [
            'mishwa zalavadiya video editor portfolio',
            'mishwa zalavadiya reels editor',
            'surat video editor portfolio',
            'instagram reels editor surat',
            'video editor ankleshwar'
        ]
    },
    '/mishwa-zalavadiya-portfolio': {
        title: `${SEO_OWNER_NAME} Portfolio | Video Editor & Visual Artist`,
        description: `Explore the official ${SEO_OWNER_NAME} portfolio with reel archives, cinematic edits, and featured client projects.`,
        keywords: [
            'mishwa zalavadiya portfolio',
            'mishwa portfolio website',
            'video editor portfolio india',
            'creative editor portfolio'
        ]
    },
    '/surat-video-editor-portfolio': {
        title: `Surat Video Editor Portfolio | ${SEO_OWNER_NAME}`,
        description: `${SEO_OWNER_NAME} builds scroll-stopping content for brands in Surat and across India, including Ankleshwar, with premium reel editing and social-first storytelling.`,
        keywords: [
            'surat video editor',
            'surat reel editor',
            'video editor gujarat',
            'instagram video editor surat',
            'ankleshwar video editor'
        ]
    }
});
const SEO_HUB_ROUTE_CONFIG = Object.freeze({
    services: {
        path: '/services',
        singular: 'service',
        title: `${SEO_OWNER_NAME} Video Editing Services | ${SEO_LOCATION}`,
        description: `${SEO_OWNER_NAME} offers premium video editing services for high-retention Reels, brand content, and cinematic storytelling in ${SEO_LOCATION}.`,
        keywords: ['video editing services', 'instagram reels editing service', 'surat video editor services']
    },
    caseStudies: {
        path: '/case-studies',
        singular: 'case study',
        title: `${SEO_OWNER_NAME} Video Editing Case Studies | ${SEO_LOCATION}`,
        description: `Explore measurable editing outcomes, creative strategy, and project breakdowns from ${SEO_OWNER_NAME}'s video editing case studies.`,
        keywords: ['video editing case studies', 'instagram reel case study', 'video editor project breakdown']
    },
    guides: {
        path: '/guides',
        singular: 'guide',
        title: `${SEO_OWNER_NAME} Video Editing Guides | ${SEO_LOCATION}`,
        description: `Practical guides from ${SEO_OWNER_NAME} on retention-focused reels, cinematic storytelling, hooks, pacing, and edit structure.`,
        keywords: ['video editing guide', 'instagram reels strategy guide', 'retention editing tips']
    }
});
const SEO_AI_BOT_ALLOWLIST = ['GPTBot', 'OAI-SearchBot', 'Google-Extended', 'ClaudeBot', 'PerplexityBot', 'CCBot'];
const GA_MEASUREMENT_ID = sanitizeString(process.env.GA_MEASUREMENT_ID || '', 32).toUpperCase();
const GA_ENABLED = /^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID);
const GA_CONSENT_DEFAULT = String(process.env.GA_CONSENT_DEFAULT || 'denied').trim().toLowerCase() === 'granted'
    ? 'granted'
    : 'denied';
const SEO_BOT_FASTPATH_ENABLED = String(process.env.SEO_BOT_FASTPATH || 'true').trim().toLowerCase() !== 'false';
const CANONICAL_PUBLIC_URL = normalizePublicSiteUrl(process.env.PUBLIC_SITE_URL || process.env.PUBLIC_BASE_URL);
const CANONICAL_PUBLIC_HOST = (() => {
    if (!CANONICAL_PUBLIC_URL) return '';
    try {
        return new URL(CANONICAL_PUBLIC_URL).host.toLowerCase();
    } catch {
        return '';
    }
})();
const CANONICAL_WWW_HOST = CANONICAL_PUBLIC_HOST && !CANONICAL_PUBLIC_HOST.startsWith('www.')
    ? `www.${CANONICAL_PUBLIC_HOST}`
    : '';

const parseTwitterHandle = (value) => {
    const raw = sanitizeString(String(value || ''), 200);
    if (!raw) return '';
    if (raw.startsWith('@')) return raw;
    const trimmed = raw.replace(/\/+$/, '');
    const match = trimmed.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})$/i);
    if (match?.[1]) return `@${match[1]}`;
    return '';
};

const getHostWithoutPort = (value) => String(value || '').trim().toLowerCase().replace(/:\d+$/, '');

const getRequestHost = (req) => {
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    return getHostWithoutPort(forwardedHost || req.get('host'));
};

// `getRequestProtocol` was removed because it's not used anywhere in this file.

const SEO_CRAWLER_PATTERN = /(googlebot|bingbot|duckduckbot|yandex(bot)?|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|lighthouse|seositecheckup|sitecheckup)/i;

const isCrawlerRequest = (req) => {
    const userAgent = String(req.headers['user-agent'] || '');
    return SEO_CRAWLER_PATTERN.test(userAgent);
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

// Canonical host normalization (non-www -> canonical host).
app.use((req, res, next) => {
    if (!CANONICAL_PUBLIC_HOST || !CANONICAL_WWW_HOST) {
        next();
        return;
    }

    const host = getRequestHost(req);
    if (host !== CANONICAL_WWW_HOST) {
        next();
        return;
    }

    const targetUrl = `https://${CANONICAL_PUBLIC_HOST}${req.originalUrl || req.url || '/'}`;
    res.redirect(301, targetUrl);
});

// Security headers
app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    const gaScriptSources = GA_ENABLED ? " https://www.googletagmanager.com" : '';
    const gaConnectSources = GA_ENABLED
        ? " https://www.google-analytics.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://www.googletagmanager.com"
        : '';
    const cloudflareScriptSources = ' https://static.cloudflareinsights.com';
    const cloudflareConnectSources = ' https://cloudflareinsights.com https://static.cloudflareinsights.com';
    res.setHeader('Content-Security-Policy',
        `default-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://ip-api.com https://cdn.jsdelivr.net${gaConnectSources}${cloudflareConnectSources}; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'nonce-${nonce}'${gaScriptSources}${cloudflareScriptSources}; frame-ancestors 'none';`
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

const renderBlockedPage = ({ reason, blockedUntil, remainingMs, nonce }) => {
    const safeReason = escapeHtml(reason || 'Suspicious traffic was detected from your network.');
    const blockedUntilIso = new Date(blockedUntil || Date.now()).toISOString();
    const remainingSeconds = Math.max(1, Math.ceil((remainingMs || 0) / 1000));
    const safeNonce = nonce ? ` nonce="${escapeHtml(nonce)}"` : '';

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
  <script${safeNonce}>
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
            remainingMs: blockStatus.remainingMs,
            nonce: res.locals?.cspNonce || ''
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
    app.use(express.static(DIST_PATH, {
        index: false,
        setHeaders: (res, filePath) => {
            // Cache hashed build assets aggressively; keep everything else short-lived.
            if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else if (filePath.includes(`${path.sep}favicons${path.sep}`) || filePath.endsWith('site.webmanifest') || filePath.endsWith('my-logo-circle.png')) {
                res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=300');
            }
        }
    }));
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
const writeDB = (data) => {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

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
    if (!db.content || typeof db.content !== 'object') db.content = {};
    const slugResult = ensureProjectSlugs(db.content);
    const seoResult = ensureProjectSeoFields(slugResult.content);
    const seoHubResult = ensureSeoHubContent(seoResult.content);
    db.content = seoHubResult.content;
    if (!db.content.social || typeof db.content.social !== 'object') db.content.social = {};
    if (!sanitizeString(db.content.social.instagram || '', 260)) {
        db.content.social.instagram = SEO_DEFAULT_INSTAGRAM_URL;
    }
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
    if (!SUPABASE_ANALYTICS_ENABLED) {
        analyticsCache = { key: 'disabled', timestamp: Date.now(), visits: [] };
        return [];
    }
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

const getSeoHubEntries = (content, type) => {
    if (!SEO_ENABLE_CONTENT_HUB) return [];
    const raw = Array.isArray(content?.seo?.[type]) ? content.seo[type] : [];
    return raw
        .filter((entry) => entry && typeof entry === 'object')
        .filter((entry) => entry.indexable !== false)
        .filter((entry) => isValidSlug(String(entry.slug || '')));
};

const buildSitemapUrlSetXml = (entries, baseUrl, lastmod) => {
    const body = entries.map((entry) => {
        const loc = entry.path === '/' ? baseUrl : `${baseUrl}${entry.path}`;
        return `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
};

const SITEMAP_SEGMENT_FILES = Object.freeze({
    pages: 'pages',
    projects: 'projects',
    services: 'services',
    caseStudies: 'case-studies',
    guides: 'guides'
});

const resolveSitemapSegmentKey = (segment) => {
    const normalized = sanitizeString(segment || '', 50);
    if (!normalized) return '';
    const direct = Object.keys(SITEMAP_SEGMENT_FILES).find((key) => key.toLowerCase() === normalized.toLowerCase());
    if (direct) return direct;
    const byFileName = Object.entries(SITEMAP_SEGMENT_FILES).find(([, fileName]) => fileName.toLowerCase() === normalized.toLowerCase());
    return byFileName ? byFileName[0] : '';
};

const getSitemapRouteGroups = (db) => {
    const pageRoutes = [
        { path: '/', changefreq: 'weekly', priority: '1.0' },
        ...(SEO_INDEX_REELS ? [{ path: '/reels', changefreq: 'weekly', priority: '0.85' }] : []),
        { path: '/site-map', changefreq: 'weekly', priority: '0.6' },
        ...Object.keys(SEO_LANDING_PAGES).map((pathName) => ({ path: pathName, changefreq: 'weekly', priority: '0.8' })),
        ...(SEO_ENABLE_CONTENT_HUB
            ? [
                { path: '/services', changefreq: 'weekly', priority: '0.72' },
                { path: '/case-studies', changefreq: 'weekly', priority: '0.72' },
                { path: '/guides', changefreq: 'weekly', priority: '0.72' }
            ]
            : [])
    ];

    const projectRoutes = [];
    const seenProjectSlugs = new Set();
    if (Array.isArray(db.content?.projects)) {
        for (const project of db.content.projects) {
            const slug = project?.slug && isValidSlug(project.slug) ? project.slug : slugify(project?.title || project?.id || '');
            if (!slug || seenProjectSlugs.has(slug)) continue;
            seenProjectSlugs.add(slug);
            projectRoutes.push({ path: `/project/${slug}`, changefreq: 'monthly', priority: '0.7' });
        }
    }

    const toRoutes = (type) => getSeoHubEntries(db.content, type).map((entry) => ({
        path: `${SEO_HUB_ROUTE_CONFIG[type].path}/${entry.slug}`,
        changefreq: 'monthly',
        priority: type === 'services' ? '0.68' : '0.64'
    }));

    return {
        pages: pageRoutes,
        projects: projectRoutes,
        services: toRoutes('services'),
        caseStudies: toRoutes('caseStudies'),
        guides: toRoutes('guides')
    };
};

// Sitemap index for SEO
app.get('/sitemap.xml', (req, res) => {
    try {
        const db = readDB();
        const baseUrl = getPreferredPublicBaseUrl(req);
        const lastmod = String(db.contentHistory?.[0]?.timestamp || new Date().toISOString()).split('T')[0];
        const groups = getSitemapRouteGroups(db);

        const indexRows = Object.entries(groups)
            .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
            .map(([segment]) => {
                const fileName = SITEMAP_SEGMENT_FILES[segment] || segment;
                return `  <sitemap>
    <loc>${escapeHtml(`${baseUrl}/sitemaps/${fileName}.xml`)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
  </sitemap>`;
            })
            .join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexRows}
</sitemapindex>`;

        res.setHeader('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Sitemap index generation error:', error);
        res.status(500).send('Error generating sitemap index');
    }
});

app.get('/sitemaps/:segment.xml', (req, res) => {
    try {
        const db = readDB();
        const baseUrl = getPreferredPublicBaseUrl(req);
        const lastmod = String(db.contentHistory?.[0]?.timestamp || new Date().toISOString()).split('T')[0];
        const groups = getSitemapRouteGroups(db);
        const segment = resolveSitemapSegmentKey(req.params.segment || '');

        if (!segment || !Object.prototype.hasOwnProperty.call(groups, segment)) {
            return res.status(404).send('Sitemap segment not found');
        }

        const entries = groups[segment];
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(404).send('Sitemap segment empty');
        }

        const xml = buildSitemapUrlSetXml(entries, baseUrl, lastmod);
        res.setHeader('Content-Type', 'application/xml');
        return res.send(xml);
    } catch (error) {
        console.error('Sitemap segment generation error:', error);
        return res.status(500).send('Error generating sitemap segment');
    }
});

// Robots.txt for SEO
app.get('/robots.txt', (req, res) => {
    const baseUrl = getPreferredPublicBaseUrl(req);
    const botApiAllowPaths = [
        '/api/content',
        '/api/track',
        '/api/track/page',
        '/api/track/heartbeat',
        '/api/track/reel'
    ];
    const botApiAllowRules = botApiAllowPaths.map((path) => `Allow: ${path}`).join('\n');
    const aiBotDirectives = SEO_AI_BOT_ALLOWLIST.map((bot) => `User-agent: ${bot}
Allow: /
${botApiAllowRules}
Disallow: /admin/
Disallow: /api/
`).join('\n');

    const robotsTxt = `User-agent: *
Allow: /
${botApiAllowRules}
Disallow: /admin/
Disallow: /api/

${aiBotDirectives}
Sitemap: ${baseUrl}/sitemap.xml
# AI context: ${baseUrl}/llms.txt
`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(robotsTxt);
});

app.get('/api/seo/health', (req, res) => {
    try {
        const db = readDB();
        const baseUrl = getPreferredPublicBaseUrl(req);
        const groups = getSitemapRouteGroups(db);
        const content = db.content || {};
        const hubCounts = {
            services: getSeoHubEntries(content, 'services').length,
            caseStudies: getSeoHubEntries(content, 'caseStudies').length,
            guides: getSeoHubEntries(content, 'guides').length
        };

        const payload = {
            status: 'ok',
            canonicalBaseUrl: baseUrl,
            config: {
                primaryBrandRoute: SEO_PRIMARY_BRAND_ROUTE,
                indexReels: SEO_INDEX_REELS,
                contentHubEnabled: SEO_ENABLE_CONTENT_HUB,
                breadcrumbSchemaEnabled: SEO_ENABLE_BREADCRUMB_SCHEMA
            },
            counts: {
                sitemap: Object.fromEntries(Object.entries(groups).map(([key, routes]) => [key, routes.length])),
                projects: Array.isArray(content.projects) ? content.projects.length : 0,
                hub: hubCounts
            },
            checks: {
                hasPersonSchema: true,
                hasWebsiteSchema: true,
                hasProfessionalServiceSchema: true,
                hasCustom404: true
            }
        };

        res.json(payload);
    } catch (error) {
        reportServerError('SEO Health Error', error, req);
        res.status(500).json({ status: 'error', error: 'Failed to build SEO health report.' });
    }
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
                project.slug = sanitizeString(project.slug || '', 120);
                project.seoDescription = sanitizeString(
                    project.seoDescription || buildProjectSeoDescription(project),
                    180
                );
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

        const slugResult = ensureProjectSlugs(content);
        const seoResult = ensureProjectSeoFields(slugResult.content);
        const seoHubResult = ensureSeoHubContent(seoResult.content);
        db.content = { ...db.content, ...seoHubResult.content };
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

        const restored = JSON.parse(JSON.stringify(target.content));
        const slugResult = ensureProjectSlugs(restored);
        const seoResult = ensureProjectSeoFields(slugResult.content);
        const seoHubResult = ensureSeoHubContent(seoResult.content);
        db.content = seoHubResult.content;
        if (!db.content.social || typeof db.content.social !== 'object') db.content.social = {};
        if (!sanitizeString(db.content.social.instagram || '', 260)) {
            db.content.social.instagram = SEO_DEFAULT_INSTAGRAM_URL;
        }
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

        if (SUPABASE_ANALYTICS_ENABLED) {
            // Try to insert into Supabase; if it fails, fall back to local DB.
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
                // Continue to local fallback below.
            }
        }

        // Supabase analytics disabled or failed - store locally but avoid duplicates.
        const localVisit = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...visitorData, ...profileOverride };
        db.analytics.visits.push(localVisit);
        // Keep list length limited
        if (db.analytics.visits.length > 2000) db.analytics.visits = db.analytics.visits.slice(-2000);
        writeDB(db);
        analyticsCache = { timestamp: 0, key: '', visits: [] };
        persistVisitProfileOverride(localVisit.id, profileOverride);
        return res.json({ success: true, visitId: localVisit.id, source: 'local' });
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

        if (SUPABASE_ANALYTICS_ENABLED) {
            const { error } = await supabase.from('visitors').update({ page_viewed: pageViewed }).eq('id', visitId);
            if (error) {
                logNotification('warning', 'Page Tracking Sync Warning', `Failed to sync page path to Supabase: ${error.message}`, null);
            }
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

        const idx = db.analytics.visits.findIndex(v => v.id === visitId);
        if (idx !== -1) {
            db.analytics.visits[idx].session_duration = duration;
        }

        if (SUPABASE_ANALYTICS_ENABLED) {
            const { error } = await supabase.from('visitors').update({ session_duration: duration }).eq('id', visitId);

            if (error) {
                logNotification('warning', 'Heartbeat Sync Warning', `Failed to sync session duration to Supabase: ${error.message}`, null);
            }
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
            const localIndex = db.analytics.visits.findIndex((visit) => String(visit.id) === String(visitId));
            if (localIndex !== -1) {
                db.analytics.visits[localIndex].reel_id = reelId;
            }
            if (SUPABASE_ANALYTICS_ENABLED) {
                await supabase.from('visitors').update({ reel_id: reelId }).eq('id', visitId);
            }
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
    if (!SUPABASE_ANALYTICS_ENABLED) return 0;
    let query = supabase.from('visitors').select('id', { count: 'exact', head: true });
    if (from) {
        query = query.gte('created_at', from);
    }
    const { count, error } = await query;
    if (error) throw error;
    return Number(count || 0);
};

const deleteSupabaseVisitorsInBatches = async () => {
    if (!SUPABASE_ANALYTICS_ENABLED) return 0;
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
        let supabaseAvailable = SUPABASE_ANALYTICS_ENABLED;

        if (SUPABASE_ANALYTICS_ENABLED) {
            try {
                supabaseCount = await countSupabaseVisitors({ from: clearedAt });
            } catch (error) {
                supabaseAvailable = false;
            }
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
        const hasSupabaseServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && SUPABASE_ANALYTICS_ENABLED;

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

const getPublicSiteUrlForRequest = (req) => {
    return getPreferredPublicBaseUrl(req);
};

const resolveAbsoluteUrl = (baseUrl, url) => {
    const raw = sanitizeString(String(url || ''), 600);
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (!raw.startsWith('/')) return `${baseUrl}/${raw}`;
    return `${baseUrl}${raw}`;
};

const buildSeoForRequest = ({ pathName, baseUrl, content }) => {
    const safeBase = baseUrl || '';
    const normalizedPath = pathName && pathName !== '/' ? String(pathName).replace(/\/+$/, '') : '/';
    const canonical = normalizedPath === '/' ? safeBase : `${safeBase}${normalizedPath}`;
    const ogFallbackImage = resolveAbsoluteUrl(safeBase, SEO_DEFAULT_IMAGE_PATH) || `${safeBase}/images/mishwa_portrait.png`;
    const brandLogo = resolveAbsoluteUrl(safeBase, SEO_DEFAULT_IMAGE_PATH) || ogFallbackImage;

    const name = SEO_BRAND_NAME || 'Mishwa';
    const ownerName = SEO_OWNER_NAME || name;
    const siteName = SEO_SITE_NAME || `${name} Portfolio`;
    const jobTitle = 'Video Editor & Visual Artist';
    const location = SEO_LOCATION || 'Surat, Gujarat, India';
    const socials = content?.social || {};
    const sameAs = Array.from(new Set([
        SEO_DEFAULT_INSTAGRAM_URL,
        socials.instagram,
        socials.youtube,
        socials.twitter
    ].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())));
    const twitterSite = parseTwitterHandle(process.env.SEO_TWITTER_HANDLE || socials.twitter);
    const hubContent = content?.seo || {};
    const hubEntries = {
        services: getSeoHubEntries(content, 'services'),
        caseStudies: getSeoHubEntries(content, 'caseStudies'),
        guides: getSeoHubEntries(content, 'guides')
    };
    const sharedFaqs = sanitizeSeoFaqItems(hubContent?.faqs || []);

    const dedupeKeywords = (...groups) => {
        const entries = groups.flatMap((group) => {
            if (!group) return [];
            return Array.isArray(group) ? group : [group];
        });
        const seen = new Set();
        const deduped = [];
        for (const keyword of entries) {
            const value = sanitizeString(String(keyword || ''), 120);
            if (!value) continue;
            const lowered = value.toLowerCase();
            if (seen.has(lowered)) continue;
            seen.add(lowered);
            deduped.push(value);
        }
        return deduped;
    };

    const buildSeoPayload = ({
        statusCode = 200,
        title,
        description,
        robots = 'index,follow',
        keywords = [],
        ogType = 'website',
        image = ogFallbackImage,
        imageAlt = `${ownerName} portfolio logo`,
        jsonLd = [],
        canonicalUrl = canonical,
        breadcrumbs = [],
        faqItems = []
    }) => {
        const resolvedImage = resolveAbsoluteUrl(safeBase, image) || ogFallbackImage;
        const mergedKeywords = dedupeKeywords(SEO_DEFAULT_KEYWORDS, keywords);
        const breadcrumbJsonLd = SEO_ENABLE_BREADCRUMB_SCHEMA && Array.isArray(breadcrumbs) && breadcrumbs.length > 1
            ? [{
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: breadcrumbs.map((crumb, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: crumb.name,
                    item: crumb.url
                }))
            }]
            : [];
        const faqJsonLd = Array.isArray(faqItems) && faqItems.length > 0
            ? [{
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: faqItems.map((faq) => ({
                    '@type': 'Question',
                    name: faq.q,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: faq.a
                    }
                }))
            }]
            : [];
        return {
            statusCode,
            title,
            description,
            canonical: canonicalUrl,
            robots,
            keywords: mergedKeywords,
            og: {
                type: ogType,
                site_name: siteName,
                locale: 'en_IN',
                url: canonicalUrl,
                title,
                description,
                image: resolvedImage,
                imageAlt,
                imageType: resolvedImage.endsWith('.png') ? 'image/png' : ''
            },
            twitter: {
                card: 'summary_large_image',
                title,
                description,
                image: resolvedImage,
                imageAlt,
                site: twitterSite || ''
            },
            geo: {
                placename: location,
                position: '21.1702;72.8311',
                region: 'IN-GJ'
            },
            jsonLd: [...(Array.isArray(jsonLd) ? jsonLd : []), ...breadcrumbJsonLd, ...faqJsonLd]
        };
    };

    const baseJsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'Person',
            '@id': `${safeBase}#person`,
            name: ownerName,
            alternateName: name,
            url: safeBase || undefined,
            jobTitle,
            image: ogFallbackImage,
            description: `${ownerName} is a ${location}-based video editor & visual artist specializing in high-retention Instagram Reels and cinematic storytelling.`,
            homeLocation: { '@type': 'Place', name: location },
            sameAs
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': `${safeBase}#website`,
            name: siteName,
            url: safeBase || undefined,
            inLanguage: 'en-IN'
        },
        {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            '@id': `${safeBase}#organization`,
            name: siteName,
            url: safeBase || undefined,
            logo: brandLogo,
            sameAs
        },
        {
            '@context': 'https://schema.org',
            '@type': 'ProfessionalService',
            '@id': `${safeBase}#service`,
            name: `${ownerName} Video Editing Services`,
            url: safeBase || undefined,
            image: brandLogo,
            areaServed: {
                '@type': 'City',
                name: 'Surat'
            },
            address: {
                '@type': 'PostalAddress',
                addressLocality: 'Surat',
                addressRegion: 'Gujarat',
                addressCountry: 'IN'
            },
            sameAs
        }
    ];

    if (normalizedPath.startsWith('/admin')) {
        return buildSeoPayload({
            statusCode: 200,
            title: `Admin | ${name}`,
            description: 'Admin panel (private).',
            robots: 'noindex,nofollow',
            keywords: ['admin panel', `${name} admin`],
            jsonLd: baseJsonLd
        });
    }

    const landingPage = SEO_LANDING_PAGES[normalizedPath];
    if (landingPage) {
        return buildSeoPayload({
            title: landingPage.title,
            description: landingPage.description,
            keywords: landingPage.keywords,
            breadcrumbs: [
                { name: 'Home', url: safeBase },
                { name: landingPage.title, url: canonical }
            ],
            faqItems: sharedFaqs.slice(0, 5),
            jsonLd: [
                ...baseJsonLd,
                {
                    '@context': 'https://schema.org',
                    '@type': 'ProfilePage',
                    name: landingPage.title,
                    description: landingPage.description,
                    url: canonical,
                    isPartOf: { '@id': `${safeBase}#website` },
                    mainEntity: { '@id': `${safeBase}#person` }
                }
            ]
        });
    }

    if (normalizedPath === '/reels') {
        const title = `Reel Archives | ${ownerName} Edits`;
        const description = `Browse reel archives by category: high-retention Instagram edits, cinematic storytelling, and social-first projects from ${ownerName}.`;
        const projects = Array.isArray(content?.projects) ? content.projects : [];
        const topItems = projects.slice(0, 10).map((project, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: sanitizeString(project?.title || `Project ${index + 1}`, 120),
            url: `${safeBase}/project/${encodeURIComponent(String(project?.slug || project?.id || `project-${index + 1}`))}`
        }));

        return buildSeoPayload({
            title,
            description,
            robots: SEO_INDEX_REELS ? 'index,follow' : 'noindex,nofollow',
            keywords: ['mishwa reels archive', 'instagram reels portfolio', 'video editing projects', 'short form editor'],
            breadcrumbs: [
                { name: 'Home', url: safeBase },
                { name: 'Reel Archives', url: canonical }
            ],
            jsonLd: [
                ...baseJsonLd,
                {
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: title,
                    url: canonical,
                    description,
                    isPartOf: { '@id': `${safeBase}#website` },
                    hasPart: topItems.length > 0 ? {
                        '@type': 'ItemList',
                        itemListElement: topItems
                    } : undefined
                }
            ]
        });
    }

    if (SEO_ENABLE_CONTENT_HUB) {
        const findHubEntry = (type, slug) => hubEntries[type].find((entry) => String(entry.slug || '').toLowerCase() === slug);
        const hubPathMap = {
            '/services': 'services',
            '/case-studies': 'caseStudies',
            '/guides': 'guides'
        };

        if (Object.prototype.hasOwnProperty.call(hubPathMap, normalizedPath)) {
            const type = hubPathMap[normalizedPath];
            const config = SEO_HUB_ROUTE_CONFIG[type];
            const items = hubEntries[type];
            return buildSeoPayload({
                title: config.title,
                description: config.description,
                keywords: config.keywords,
                breadcrumbs: [
                    { name: 'Home', url: safeBase },
                    { name: config.singular === 'service' ? 'Services' : config.singular === 'case study' ? 'Case Studies' : 'Guides', url: canonical }
                ],
                faqItems: sharedFaqs.slice(0, 6),
                jsonLd: [
                    ...baseJsonLd,
                    {
                        '@context': 'https://schema.org',
                        '@type': 'CollectionPage',
                        name: config.title,
                        description: config.description,
                        url: canonical,
                        hasPart: {
                            '@type': 'ItemList',
                            itemListElement: items.slice(0, 30).map((item, index) => ({
                                '@type': 'ListItem',
                                position: index + 1,
                                name: item.title,
                                url: `${safeBase}${config.path}/${item.slug}`
                            }))
                        }
                    }
                ]
            });
        }

        const contentMatch = normalizedPath.match(/^\/(services|case-studies|guides)\/([^/]+)$/);
        if (contentMatch) {
            const routePrefix = `/${contentMatch[1]}`;
            const slug = decodeURIComponent(contentMatch[2] || '').trim().toLowerCase();
            const type = routePrefix === '/services'
                ? 'services'
                : routePrefix === '/case-studies'
                    ? 'caseStudies'
                    : 'guides';
            const config = SEO_HUB_ROUTE_CONFIG[type];
            const entry = findHubEntry(type, slug);

            if (!entry || entry.indexable === false) {
                return buildSeoPayload({
                    statusCode: 404,
                    title: `Content Not Found | ${siteName}`,
                    description: `The requested ${config.singular} is unavailable.`,
                    robots: 'noindex,nofollow',
                    breadcrumbs: [
                        { name: 'Home', url: safeBase },
                        { name: routePrefix.slice(1), url: `${safeBase}${routePrefix}` }
                    ],
                    jsonLd: baseJsonLd
                });
            }

            const entryTitle = sanitizeString(entry.title || `${config.singular} by ${ownerName}`, 140);
            const entryDescription = sanitizeString(
                entry.excerpt || entry.intro || `${entryTitle} by ${ownerName}, ${location}-based video editor.`,
                180
            );
            const entryUrl = `${safeBase}${config.path}/${entry.slug}`;
            const entryImage = resolveAbsoluteUrl(safeBase, entry.heroImage) || ogFallbackImage;
            const faqItems = sanitizeSeoFaqItems(entry.faqs).slice(0, 8);

            return buildSeoPayload({
                title: `${entryTitle} | ${ownerName}`,
                description: entryDescription,
                canonicalUrl: entryUrl,
                image: entryImage,
                keywords: [entry.primaryKeyword, ...(entry.secondaryKeywords || []), `${ownerName} ${config.singular}`],
                breadcrumbs: [
                    { name: 'Home', url: safeBase },
                    {
                        name: routePrefix === '/services' ? 'Services' : routePrefix === '/case-studies' ? 'Case Studies' : 'Guides',
                        url: `${safeBase}${routePrefix}`
                    },
                    { name: entryTitle, url: entryUrl }
                ],
                faqItems,
                jsonLd: [
                    ...baseJsonLd,
                    {
                        '@context': 'https://schema.org',
                        '@type': type === 'guides' ? 'Article' : 'CreativeWork',
                        name: entryTitle,
                        description: entryDescription,
                        url: entryUrl,
                        image: entryImage,
                        author: { '@id': `${safeBase}#person` },
                        publisher: { '@id': `${safeBase}#organization` },
                        datePublished: entry.publishedAt || undefined,
                        dateModified: entry.updatedAt || entry.publishedAt || undefined
                    }
                ]
            });
        }
    }

    const projectMatch = normalizedPath.match(/^\/project\/([^/]+)$/);
    if (projectMatch) {
        const slug = decodeURIComponent(projectMatch[1] || '').trim().toLowerCase();
        const projects = Array.isArray(content?.projects) ? content.projects : [];
        const project = projects.find((p) => String(p?.slug || '').toLowerCase() === slug) || projects.find((p) => String(p?.id || '') === slug);

        if (!project) {
            const title = `Project Not Found | ${name} Portfolio`;
            const description = `The requested project was not found. Browse ${name}'s reels and portfolio work.`;
            return buildSeoPayload({
                statusCode: 404,
                title,
                description,
                robots: 'noindex,nofollow',
                keywords: ['project not found', `${name} reels`],
                jsonLd: baseJsonLd
            });
        }

        const projTitle = sanitizeString(project.title || 'Project', 120);
        const category = sanitizeString(project.category || '', 80);
        const title = `${projTitle}${category ? ` (${category})` : ''} | ${ownerName} Video Editor`;
        const description = sanitizeString(
            project.seoDescription ||
            `Watch "${projTitle}" ${category ? `(${category}) ` : ''}edited by ${ownerName}, a ${location}-based video editor specializing in high-retention Reels and cinematic storytelling.`,
            180
        );
        const image = resolveAbsoluteUrl(safeBase, project.image) || ogFallbackImage;
        const url = canonical;

        return buildSeoPayload({
            title,
            description,
            canonicalUrl: url,
            ogType: 'article',
            image,
            imageAlt: `${projTitle} by ${ownerName}`,
            keywords: [projTitle, category, `${ownerName} portfolio`, 'video editor reel', 'cinematic reel edit'],
            breadcrumbs: [
                { name: 'Home', url: safeBase },
                { name: 'Reel Archives', url: `${safeBase}/reels` },
                { name: projTitle, url }
            ],
            jsonLd: [
                ...baseJsonLd,
                {
                    '@context': 'https://schema.org',
                    '@type': 'CreativeWork',
                    '@id': `${url}#creativework`,
                    name: projTitle,
                    description,
                    url,
                    image,
                    genre: category || undefined,
                    creator: { '@id': `${safeBase}#person` }
                }
            ]
        });
    }

    if (normalizedPath === '/site-map') {
        const description = `Browse all key pages from ${siteName}, including portfolio projects, guides, services, and case studies.`;
        return buildSeoPayload({
            title: `Site Map | ${siteName}`,
            description,
            keywords: ['site map', `${ownerName} pages`, 'portfolio pages'],
            breadcrumbs: [
                { name: 'Home', url: safeBase },
                { name: 'Site Map', url: canonical }
            ],
            jsonLd: [
                ...baseJsonLd,
                {
                    '@context': 'https://schema.org',
                    '@type': 'WebPage',
                    name: `Site Map | ${siteName}`,
                    url: canonical,
                    description
                }
            ]
        });
    }

    if (normalizedPath !== '/') {
        const title = `Page Not Found | ${name} Portfolio`;
        const description = `The requested page was not found. Visit ${name}'s portfolio home or reel archives.`;
        return buildSeoPayload({
            statusCode: 404,
            title,
            description,
            robots: 'noindex,nofollow',
            keywords: ['page not found', `${name} portfolio`],
            jsonLd: baseJsonLd
        });
    }

    const homeTitle = SEO_PRIMARY_BRAND_ROUTE === '/'
        ? `${ownerName} - Video Editor in Surat | Official Portfolio`
        : `${ownerName} | Surat Video Editor Portfolio`;
    const description = `${ownerName} is a Surat-based video editor and visual artist specializing in high-retention Instagram Reels, cinematic brand storytelling, and portfolio edits for clients across India, including Ankleshwar.`;
    return buildSeoPayload({
        title: homeTitle,
        description,
        keywords: [
            'mishwa zalavadiya portfolio',
            'mishwa video editor portfolio',
            'surat video editor portfolio',
            'high retention reel editor',
            'cinematic storytelling editor'
        ],
        breadcrumbs: [{ name: 'Home', url: safeBase }],
        faqItems: sharedFaqs.slice(0, 6),
        jsonLd: [
            ...baseJsonLd,
            {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: homeTitle,
                url: canonical,
                description,
                isPartOf: { '@id': `${safeBase}#website` },
                about: { '@id': `${safeBase}#person` }
            }
        ]
    });
};

const buildSeoFallbackMarkup = ({ content, baseUrl }) => {
    const projects = Array.isArray(content?.projects) ? content.projects.slice(0, 6) : [];
    const highlights = projects.map((project) => {
        const slug = encodeURIComponent(String(project?.slug || project?.id || '').trim());
        const title = escapeHtml(sanitizeString(project?.title || 'Project', 80));
        if (!slug || !title) return '';
        return `<li><a href="/project/${slug}">${title}</a></li>`;
    }).filter(Boolean);

    return `
<section data-seo-fallback="true" id="seo-static-fallback" style="padding:24px 20px;max-width:980px;margin:0 auto;color:#d9ecff;background:#020c1b;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#64ffda;margin:0 0 10px;">Video Editor Portfolio</p>
  <h1 style="font-size:clamp(28px,4vw,44px);line-height:1.15;margin:0 0 14px;color:#ffffff;">Mishwa Zalavadiya Video Editor Portfolio in Surat</h1>
  <p style="font-size:17px;line-height:1.7;margin:0 0 16px;color:#9fb3c8;">Surat-based reel editor for high-retention Instagram Reels, cinematic storytelling, and social-first video campaigns.</p>
  <h2 style="font-size:21px;line-height:1.3;margin:18px 0 10px;color:#ffffff;">Featured Video Editing Work</h2>
  <p style="font-size:15px;line-height:1.7;margin:0 0 12px;color:#9fb3c8;">Browse project archives, category reels, and branded edits crafted for retention and conversion.</p>
  <p style="margin:0 0 10px;font-size:14px;">
    <a href="/reels" style="color:#64ffda;text-decoration:none;margin-right:14px;">View Reel Archives</a>
    <a href="/surat-video-editor-portfolio" style="color:#64ffda;text-decoration:none;">Surat Video Editor Portfolio</a>
  </p>
  ${highlights.length > 0
        ? `<ul style="margin:10px 0 0;padding-left:18px;line-height:1.6;color:#c9d6e2;">${highlights.join('')}</ul>`
        : ''}
  <p style="margin:14px 0 0;font-size:12px;color:#7f93a8;">Canonical: ${escapeHtml(baseUrl)}</p>
</section>`;
};

const renderAnalyticsHeadBlock = (nonce, includeAnalytics) => {
    if (!includeAnalytics || !GA_ENABLED) return '';
    const safeNonce = nonce ? ` nonce="${escapeHtml(nonce)}"` : '';
    const consentKey = 'mishwa_analytics_consent';
    const denyPayload = "{ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }";
    const grantedPayload = "{ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }";

    return [
        `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(GA_MEASUREMENT_ID)}"></script>`,
        `<script${safeNonce}>`,
        'window.dataLayer = window.dataLayer || [];',
        'window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};',
        `window.__GA_MEASUREMENT_ID = '${escapeHtml(GA_MEASUREMENT_ID)}';`,
        `window.__GA_CONSENT_KEY = '${consentKey}';`,
        `window.__GA_CONSENT_DEFAULT = '${GA_CONSENT_DEFAULT}';`,
        'var savedConsent = null;',
        `try { savedConsent = localStorage.getItem('${consentKey}'); } catch (_) { savedConsent = null; }`,
        `gtag('consent', 'default', ${GA_CONSENT_DEFAULT === 'granted' ? grantedPayload : denyPayload});`,
        'if (savedConsent === "granted") {',
        `  gtag('consent', 'update', ${grantedPayload});`,
        "  gtag('js', new Date());",
        `  gtag('config', '${escapeHtml(GA_MEASUREMENT_ID)}', { anonymize_ip: true, transport_type: 'beacon' });`,
        '}',
        '</script>'
    ].join('\n');
};

const optimizeRenderBlockingStyles = (html, _nonce) => {
    // Keep stylesheet links blocking by default. Cloudflare Rocket Loader can
    // interfere with async CSS-loader scripts and leave pages unstyled.
    return html;
};

const injectRootFallbackContent = (html, markup) => {
    if (!html || !markup) return html;
    if (html.includes('data-seo-fallback="true"')) return html;
    return html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
};

const stripClientEntrypointScript = (html) => {
    if (!html || typeof html !== 'string') return html;
    return html.replace(/<script[^>]+type=["']module["'][^>]*><\/script>/gi, '');
};

const markScriptsAsCloudflareSafe = (html) => {
    if (!html || typeof html !== 'string') return html;
    return html.replace(/<script\b([^>]*)>/gi, (fullTag, attrs = '') => {
        if (/\bdata-cfasync\s*=/i.test(attrs)) return fullTag;
        if (/src=["'][^"']*\/cdn-cgi\//i.test(attrs)) return fullTag;
        return `<script data-cfasync="false"${attrs}>`;
    });
};

const renderSeoMetaBlock = (seo, nonce, { includeAnalytics = false } = {}) => {
    const keywords = Array.isArray(seo.keywords) && seo.keywords.length > 0
        ? seo.keywords.slice(0, SEO_META_KEYWORD_LIMIT).join(', ')
        : SEO_DEFAULT_KEYWORDS.slice(0, SEO_META_KEYWORD_LIMIT).join(', ');
    const safeNonce = nonce ? ` nonce="${escapeHtml(nonce)}"` : '';
    const jsonLdBlocks = Array.isArray(seo.jsonLd) && seo.jsonLd.length > 0
        ? seo.jsonLd
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => `<script type="application/ld+json"${safeNonce}>${JSON.stringify(entry)}</script>`)
            .join('\n')
        : '';
    const analyticsBlock = renderAnalyticsHeadBlock(nonce, includeAnalytics);
    const tags = [
        '<!--__SEO_START__-->',
        `<title>${escapeHtml(seo.title || '')}</title>`,
        `<meta name="description" content="${escapeHtml(seo.description || '')}" />`,
        `<meta name="keywords" content="${escapeHtml(keywords)}" />`,
        `<meta name="author" content="${escapeHtml(SEO_OWNER_NAME)}" />`,
        '<meta name="generator" content="Mishwa Portfolio Site" />',
        `<meta name="robots" content="${escapeHtml(seo.robots || 'index,follow')}" />`,
        `<link rel="canonical" href="${escapeHtml(seo.canonical || '')}" />`,
        '<meta name="geo.placename" content="' + escapeHtml(seo.geo?.placename || SEO_LOCATION) + '" />',
        '<meta name="geo.region" content="' + escapeHtml(seo.geo?.region || 'IN-GJ') + '" />',
        '<meta name="geo.position" content="' + escapeHtml(seo.geo?.position || '21.1702;72.8311') + '" />',
        '',
        '<meta property="og:type" content="' + escapeHtml(seo.og?.type || 'website') + '" />',
        '<meta property="og:site_name" content="' + escapeHtml(seo.og?.site_name || SEO_SITE_NAME) + '" />',
        '<meta property="og:locale" content="' + escapeHtml(seo.og?.locale || 'en_IN') + '" />',
        '<meta property="og:url" content="' + escapeHtml(seo.og?.url || seo.canonical || '') + '" />',
        '<meta property="og:title" content="' + escapeHtml(seo.og?.title || seo.title || '') + '" />',
        '<meta property="og:description" content="' + escapeHtml(seo.og?.description || seo.description || '') + '" />',
        '<meta property="og:image" content="' + escapeHtml(seo.og?.image || '') + '" />',
        '<meta property="og:image:secure_url" content="' + escapeHtml(seo.og?.image || '') + '" />',
        '<meta property="og:image:alt" content="' + escapeHtml(seo.og?.imageAlt || `${SEO_OWNER_NAME} portfolio logo`) + '" />',
        seo.og?.imageType ? `<meta property="og:image:type" content="${escapeHtml(seo.og.imageType)}" />` : '',
        '',
        '<meta name="twitter:card" content="' + escapeHtml(seo.twitter?.card || 'summary_large_image') + '" />',
        seo.twitter?.site ? `<meta name="twitter:site" content="${escapeHtml(seo.twitter.site)}" />` : '',
        '<meta name="twitter:title" content="' + escapeHtml(seo.twitter?.title || seo.title || '') + '" />',
        '<meta name="twitter:description" content="' + escapeHtml(seo.twitter?.description || seo.description || '') + '" />',
        '<meta name="twitter:image" content="' + escapeHtml(seo.twitter?.image || '') + '" />',
        '<meta name="twitter:image:alt" content="' + escapeHtml(seo.twitter?.imageAlt || `${SEO_OWNER_NAME} portfolio logo`) + '" />',
        jsonLdBlocks,
        analyticsBlock,
        '<!--__SEO_END__-->'
    ];

    return tags.filter(Boolean).join('\n');
};

const injectSeoIntoHtml = (html, seoBlock) => {
    if (!html || typeof html !== 'string') return html;
    const start = '<!--__SEO_START__-->';
    const end = '<!--__SEO_END__-->';
    const startIdx = html.indexOf(start);
    const endIdx = html.indexOf(end);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        return html.slice(0, startIdx) + seoBlock + html.slice(endIdx + end.length);
    }
    return html.replace('</head>', `${seoBlock}\n</head>`);
};

// Handles any requests that don't match the API routes by sending back the main index.html file (with SEO injected).
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }

    if (!HAS_DIST) {
        return res.status(404).send('Frontend build not found. Run `npm run build` before starting the production server.');
    }
    // Avoid returning HTML for obvious file requests that missed static middleware.
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
        return res.status(404).send('Not found');
    }

    const db = readDB();
    const baseUrl = getPublicSiteUrlForRequest(req);
    const seo = buildSeoForRequest({ pathName: req.path, baseUrl, content: db.content || {} });
    const nonce = res.locals?.cspNonce || '';
    const isNoIndex = String(seo.robots || '').includes('noindex');
    const includeAnalytics = !isNoIndex;
    const useBotFastPath = SEO_BOT_FASTPATH_ENABLED && !isNoIndex && isCrawlerRequest(req);

    const seoBlock = renderSeoMetaBlock(seo, nonce, { includeAnalytics });
    let html = injectSeoIntoHtml(INDEX_HTML_TEMPLATE, seoBlock);

    if (req.path === '/' || useBotFastPath) {
        const fallbackMarkup = buildSeoFallbackMarkup({ content: db.content || {}, baseUrl });
        html = injectRootFallbackContent(html, fallbackMarkup);
    }

    html = optimizeRenderBlockingStyles(html, nonce);
    html = markScriptsAsCloudflareSafe(html);

    if (useBotFastPath && req.path === '/') {
        html = stripClientEntrypointScript(html);
    }

    if (isNoIndex) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(seo.statusCode || 200).send(html);
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
    console.log(`Supabase analytics enabled: ${SUPABASE_ANALYTICS_ENABLED}`);
    console.log(`SEO keyword corpus size: ${SEO_DEFAULT_KEYWORDS.length} (meta cap=${SEO_META_KEYWORD_LIMIT})`);
    console.log(`DB path: ${DB_PATH}`);
    console.log(`Static build present: ${HAS_DIST}`);
    if (!REDIS_ENABLED) {
        console.log('Redis: disabled (set REDIS_URL to enable).');
    } else {
        console.log(`Redis status: ${redisStatus} (connected=${redisConnected})`);
    }
});
