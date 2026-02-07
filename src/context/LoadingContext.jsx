import { createContext, useContext, useState, useEffect } from 'react';
import { useContent } from './ContentContext';

const LoadingContext = createContext();
const MAX_BLOCKING_PRELOAD_MS = 14000;
const PER_IMAGE_TIMEOUT_MS = 9000;
const MAX_PARALLEL_PRELOADS = 6;

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
    if (/^https?:\/\//i.test(value)) return true;
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

const preloadInBatches = async (urls, onProgress) => {
    if (!urls.length) return;

    let pointer = 0;
    let completed = 0;

    const worker = async () => {
        while (pointer < urls.length) {
            const index = pointer;
            pointer += 1;
            const src = urls[index];
            await preloadImage(src);
            completed += 1;
            onProgress(completed);
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
    const [bootstrapped, setBootstrapped] = useState(false);

    useEffect(() => {
        if (contentLoading || bootstrapped) return;
        setBootstrapped(true);

        let isCancelled = false;
        const assetUrls = collectImageAssets(content);
        const dedupedUrls = Array.from(new Set(assetUrls));
        setTotalAssets(dedupedUrls.length);
        setLoadedAssets(0);
        setLoadingLabel('Loading media assets');

        const fontsReadyPromise = document.fonts?.ready
            ? document.fonts.ready.catch(() => undefined)
            : Promise.resolve();

        const preloadPromise = preloadInBatches(dedupedUrls, (count) => {
            if (isCancelled) return;
            setLoadedAssets(count);
        });

        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), MAX_BLOCKING_PRELOAD_MS);
        });

        Promise.race([Promise.all([preloadPromise, fontsReadyPromise]), timeoutPromise]).then(() => {
            if (isCancelled) return;
            setLoadingLabel('Finalizing experience');
            setTimeout(() => {
                if (!isCancelled) setIsLoading(false);
            }, 250);
        });

        return () => {
            isCancelled = true;
        };
    }, [bootstrapped, content, contentLoading]);

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
