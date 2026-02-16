const LOCAL_IMAGE_PATTERN = /^\/images\/.+\.(png|jpe?g)$/i;
const YT_THUMB_PATTERN = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\/maxresdefault\.jpg(?:\?.*)?$/i;

export const getLocalWebpVariant = (src = '') => {
    if (typeof src !== 'string') return '';
    const trimmed = src.trim();
    if (!LOCAL_IMAGE_PATTERN.test(trimmed)) return '';
    return trimmed.replace(/\.(png|jpe?g)(\?.*)?$/i, '.webp$2');
};

export const optimizeImageSrc = (src = '') => {
    if (typeof src !== 'string') return '';
    const trimmed = src.trim();
    if (!trimmed) return '';

    const ytMatch = trimmed.match(YT_THUMB_PATTERN);
    if (ytMatch?.[1]) {
        return `https://i.ytimg.com/vi_webp/${ytMatch[1]}/maxresdefault.webp`;
    }

    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();

        if (host.includes('images.unsplash.com')) {
            parsed.searchParams.set('auto', 'format,compress');
            parsed.searchParams.set('fm', 'webp');
            if (!parsed.searchParams.get('q')) parsed.searchParams.set('q', '80');
            if (!parsed.searchParams.get('fit')) parsed.searchParams.set('fit', 'crop');
            return parsed.toString();
        }

        return parsed.toString();
    } catch {
        return trimmed;
    }
};

export const resolveImageSources = (src = '') => {
    const optimizedSrc = optimizeImageSrc(src);
    const webpSrc = getLocalWebpVariant(src);
    return {
        optimizedSrc,
        webpSrc
    };
};
