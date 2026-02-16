import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useContent } from './ContentContext';
import { useDeviceProfile } from './DeviceProfileContext';

const LoadingContext = createContext();
const MAX_BLOCKING_PRELOAD_MS = 5000;
const PER_IMAGE_TIMEOUT_MS = 7000;
const MAX_PARALLEL_PRELOADS = 3;
const MAX_BLOCKING_ASSETS = 10;
const MAX_TOTAL_LOADING_MS = 15000;
const BOT_USER_AGENT_REGEX = /(googlebot|bingbot|duckduckbot|yandex(bot)?|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|headlesschrome|lighthouse|seositecheckup|sitecheckup)/i;

const STATIC_ASSETS = [
    '/images/mishwa_portrait.webp',
    '/images/reel_thumbnail_1.webp',
    '/images/reel_thumbnail_2.webp',
    '/images/reel_thumbnail_3.webp',
    '/images/reel_thumbnail_4.webp',
    '/images/cinematic_thumbnail_1.webp'
];

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_STORAGE_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/` : '';

const isLikelyImageUrl = (value) => {
    if (!value || typeof value !== 'string') return false;
    if (value.startsWith('data:image/')) return true;
    if (value.startsWith('/images/')) return true;
    return /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(value);
};

const isPreloadAllowedUrl = (value) => {
    if (!isLikelyImageUrl(value)) return false;
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image/')) return true;
    if (SUPABASE_STORAGE_PREFIX && trimmed.startsWith(SUPABASE_STORAGE_PREFIX)) return true;

    // Allow same-origin (includes /images/... and any relative URLs)
    try {
        const resolved = new URL(trimmed, window.location.origin);
        return resolved.origin === window.location.origin;
    } catch {
        return false;
    }
};

const collectImageAssets = (content) => {
    const assets = new Set(STATIC_ASSETS);
    if (!content) return [...assets];

    const pushIfImage = (value) => {
        if (!isLikelyImageUrl(value)) return;
        assets.add(value.trim());
    };

    pushIfImage(content.about?.image);
    pushIfImage(content.headerIcon);

    Object.values(content.headerIconVariants || {}).forEach(pushIfImage);
    (content.projects || []).forEach((project) => pushIfImage(project.image));
    (content.cinema?.items || []).forEach((item) => pushIfImage(item.image));
    (content.reviews || []).forEach((review) => pushIfImage(review.image));

    return [...assets];
};

const collectCriticalAssets = (content) => {
    const critical = new Set(STATIC_ASSETS);
    if (!content) return [...critical];

    const add = (value) => {
        if (typeof value !== 'string' || !value.trim()) return;
        critical.add(value.trim());
    };

    add(content.about?.image);
    (content.projects || []).slice(0, 4).forEach((project) => add(project.image));
    (content.cinema?.items || []).slice(0, 2).forEach((item) => add(item.image));
    (content.reviews || []).slice(0, 2).forEach((review) => add(review.image));
    add(content.headerIcon);

    return Array.from(critical).slice(0, MAX_BLOCKING_ASSETS);
};

const preloadImage = (src, timeoutMs = PER_IMAGE_TIMEOUT_MS) => (
    new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';

        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            resolve();
        };

        const timer = setTimeout(done, timeoutMs);
        image.onload = done;
        image.onerror = done;
        image.src = src;
        if (image.complete) done();
    })
);

const preloadInBatches = async (urls, onLoaded) => {
    if (!urls.length) return;

    let pointer = 0;

    const worker = async () => {
        while (pointer < urls.length) {
            const index = pointer;
            pointer += 1;
            const src = urls[index];
            await preloadImage(src);
            onLoaded(src);
        }
    };

    const workers = Array.from({ length: Math.min(MAX_PARALLEL_PRELOADS, urls.length) }, () => worker());
    await Promise.all(workers);
};

export const useLoading = () => useContext(LoadingContext);

export const LoadingProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [loadedAssets, setLoadedAssets] = useState(0);
    const [totalAssets, setTotalAssets] = useState(0);
    const [loadingLabel, setLoadingLabel] = useState('Preparing Mishwa portfolio');
    const { loading: contentLoading, content } = useContent();
    const { perfMode } = useDeviceProfile();
    const startedRef = useRef(false);
    const contentRef = useRef(content);

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    useEffect(() => {
        if (contentLoading || startedRef.current) return;
        startedRef.current = true;

        const isLite = perfMode === 'lite';
        const isBotFastPath = BOT_USER_AGENT_REGEX.test(String(navigator.userAgent || ''));
        let isActive = true;
        const snapshot = contentRef.current;
        const assetUrls = (isLite || isBotFastPath)
            ? STATIC_ASSETS.filter((src) => src.startsWith('/images/')).slice(0, 2)
            : collectImageAssets(snapshot).filter(isPreloadAllowedUrl);
        const criticalUrls = (isLite || isBotFastPath)
            ? assetUrls
            : collectCriticalAssets(snapshot).filter(isPreloadAllowedUrl);
        const dedupedUrls = Array.from(new Set(assetUrls));
        const loadedUrls = new Set();
        setTotalAssets(dedupedUrls.length);
        setLoadedAssets(0);
        setLoadingLabel(isLite || isBotFastPath ? 'Starting portfolio experience' : 'Loading portfolio highlights');

        const markLoaded = (src) => {
            if (!isActive || loadedUrls.has(src)) return;
            loadedUrls.add(src);
            setLoadedAssets(loadedUrls.size);
        };

        const blockingPromise = preloadInBatches(criticalUrls, markLoaded);

        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), isLite || isBotFastPath ? 900 : MAX_BLOCKING_PRELOAD_MS);
        });

        Promise.race([blockingPromise, timeoutPromise]).then(() => {
            if (!isActive) return;
            setLoadingLabel('Finalizing portfolio');
            setTimeout(() => {
                if (isActive) setIsLoading(false);
            }, 200);

            if (isLite || isBotFastPath) return;

            const remaining = dedupedUrls.filter((src) => !loadedUrls.has(src));
            if (remaining.length > 0) {
                setLoadingLabel('Optimizing remaining visuals');
                preloadInBatches(remaining, markLoaded).catch(() => undefined);
            }
        });

        return () => {
            isActive = false;
        };
    }, [contentLoading, perfMode]);

    useEffect(() => {
        if (!isLoading) return;

        const watchdog = setTimeout(() => {
            setLoadingLabel('Launching portfolio');
            setIsLoading(false);
        }, MAX_TOTAL_LOADING_MS);

        return () => clearTimeout(watchdog);
    }, [isLoading]);

    return (
        <LoadingContext.Provider
            value={{
                isLoading,
                loadingLabel,
                loadedAssets,
                totalAssets
            }}
        >
            {children}
        </LoadingContext.Provider>
    );
};
