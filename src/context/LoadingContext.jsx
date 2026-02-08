import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useContent } from './ContentContext';

const LoadingContext = createContext();
const MAX_BLOCKING_PRELOAD_MS = 5000;
const PER_IMAGE_TIMEOUT_MS = 7000;
const MAX_PARALLEL_PRELOADS = 6;
const MAX_BLOCKING_ASSETS = 10;
const MAX_TOTAL_LOADING_MS = 15000;

const STATIC_ASSETS = [
    '/images/mishwa_portrait.png',
    '/images/reel_thumbnail_1.png',
    '/images/reel_thumbnail_2.png',
    '/images/reel_thumbnail_3.png',
    '/images/reel_thumbnail_4.png',
    '/images/cinematic_thumbnail_1.png'
];

const isLikelyImageUrl = (value) => {
    if (!value || typeof value !== 'string') return false;
    if (value.startsWith('data:image/')) return true;
    if (value.startsWith('/images/')) return true;
    return /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(value);
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
    const [loadingLabel, setLoadingLabel] = useState('Preparing startup');
    const { loading: contentLoading, content } = useContent();
    const startedRef = useRef(false);
    const contentRef = useRef(content);

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    useEffect(() => {
        if (contentLoading || startedRef.current) return;
        startedRef.current = true;

        let isActive = true;
        const snapshot = contentRef.current;
        const assetUrls = collectImageAssets(snapshot);
        const criticalUrls = collectCriticalAssets(snapshot);
        const dedupedUrls = Array.from(new Set(assetUrls));
        const loadedUrls = new Set();
        setTotalAssets(dedupedUrls.length);
        setLoadedAssets(0);
        setLoadingLabel('Loading media assets');

        const markLoaded = (src) => {
            if (!isActive || loadedUrls.has(src)) return;
            loadedUrls.add(src);
            setLoadedAssets(loadedUrls.size);
        };

        const blockingPromise = preloadInBatches(criticalUrls, markLoaded);

        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), MAX_BLOCKING_PRELOAD_MS);
        });

        Promise.race([blockingPromise, timeoutPromise]).then(() => {
            if (!isActive) return;
            setLoadingLabel('Finalizing experience');
            setTimeout(() => {
                if (isActive) setIsLoading(false);
            }, 250);

            const remaining = dedupedUrls.filter((src) => !loadedUrls.has(src));
            if (remaining.length > 0) {
                setLoadingLabel('Warming remaining assets');
                preloadInBatches(remaining, markLoaded).catch(() => undefined);
            }
        });

        return () => {
            isActive = false;
        };
    }, [contentLoading]);

    useEffect(() => {
        if (!isLoading) return;

        const watchdog = setTimeout(() => {
            setLoadingLabel('Starting experience');
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
