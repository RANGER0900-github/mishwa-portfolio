import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const CONSENT_KEY = 'mishwa_analytics_consent';

const hasGaConfig = () => Boolean(window.__GA_MEASUREMENT_ID && typeof window.gtag === 'function');

const applyConsent = (value) => {
    if (typeof window.gtag !== 'function') return;
    const consentPayload = value === 'granted'
        ? { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }
        : { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

    window.gtag('consent', 'update', consentPayload);

    if (value === 'granted' && window.__GA_MEASUREMENT_ID) {
        window.gtag('js', new Date());
        window.gtag('config', window.__GA_MEASUREMENT_ID, {
            anonymize_ip: true,
            transport_type: 'beacon'
        });
    }
};

const CookieConsent = () => {
    const location = useLocation();
    const [visible, setVisible] = useState(false);

    const isPublicRoute = useMemo(() => !location.pathname.startsWith('/admin'), [location.pathname]);

    useEffect(() => {
        if (!isPublicRoute || !hasGaConfig()) {
            setVisible(false);
            return;
        }

        const stored = localStorage.getItem(CONSENT_KEY);
        if (stored === 'granted' || stored === 'denied') {
            applyConsent(stored);
            setVisible(false);
            return;
        }

        setVisible(true);
    }, [isPublicRoute]);

    if (!visible || !isPublicRoute) return null;

    const handleSelection = (value) => {
        localStorage.setItem(CONSENT_KEY, value);
        applyConsent(value);
        setVisible(false);
    };

    return (
        <div className="fixed bottom-4 left-4 right-4 z-[120] md:left-auto md:right-6 md:max-w-md rounded-2xl border border-white/15 bg-background/95 backdrop-blur-sm p-4 shadow-2xl">
            <p className="text-white text-sm font-semibold">Analytics Consent</p>
            <p className="text-gray-300 text-xs mt-2 leading-relaxed">
                Allow anonymous analytics to improve page performance and portfolio discoverability. You can update this choice anytime by clearing site storage.
            </p>
            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    onClick={() => handleSelection('denied')}
                    className="flex-1 rounded-xl border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:bg-white/10 transition-colors"
                >
                    Decline
                </button>
                <button
                    type="button"
                    onClick={() => handleSelection('granted')}
                    className="flex-1 rounded-xl bg-secondary text-background px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-secondary/90 transition-colors"
                >
                    Accept
                </button>
            </div>
        </div>
    );
};

export default CookieConsent;
