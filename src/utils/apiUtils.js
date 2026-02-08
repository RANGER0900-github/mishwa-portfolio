/**
 * Retry fetch with exponential backoff
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} initialDelay - Initial delay in ms (default: 1000)
 * @returns {Promise} The fetch response
 */
const DEFAULT_FETCH_TIMEOUT_MS = 12000;

const createTimeoutSignal = (externalSignal, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(new DOMException(`Timed out after ${timeoutMs}ms`, 'AbortError'));
    }, timeoutMs);

    let abortListener = null;
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort(externalSignal.reason);
        } else {
            abortListener = () => controller.abort(externalSignal.reason);
            externalSignal.addEventListener('abort', abortListener, { once: true });
        }
    }

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            if (externalSignal && abortListener) {
                externalSignal.removeEventListener('abort', abortListener);
            }
        }
    };
};

export const fetchWithRetry = async (
    url,
    options = {},
    maxRetries = 3,
    initialDelay = 1000
) => {
    let lastError;
    const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...fetchOptions } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const { signal, cleanup } = createTimeoutSignal(fetchOptions.signal, timeoutMs);
        try {
            const response = await fetch(url, { ...fetchOptions, signal });

            // Don't retry on client errors (4xx)
            if (response.status >= 400 && response.status < 500) {
                return response;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response;
        } catch (error) {
            lastError = error?.name === 'AbortError'
                ? new Error(`Request timed out after ${timeoutMs}ms`)
                : error;
            console.warn(
                `Fetch attempt ${attempt + 1}/${maxRetries + 1} failed for ${url}:`,
                lastError.message
            );

            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s, etc.
                const delay = initialDelay * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        } finally {
            cleanup();
        }
    }

    throw lastError || new Error(`Failed to fetch after ${maxRetries + 1} attempts`);
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
export const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export const isValidUrl = (url) => {
    if (!url) return false;
    try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
        return true;
    } catch {
        return false;
    }
};

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return '';
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};
