import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { LoadingProvider, useLoading } from './context/LoadingContext';
import { ContentProvider } from './context/ContentContext';
import { DeviceProfileProvider, useDeviceProfile } from './context/DeviceProfileContext';
import ErrorBoundary from './components/ErrorBoundary';
import Preloader from './components/Preloader';

const Home = lazy(() => import('./pages/Home'));
const AllReels = lazy(() => import('./pages/AllReels'));
const Project = lazy(() => import('./pages/Project'));
const SeoLanding = lazy(() => import('./pages/SeoLanding'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Login = lazy(() => import('./pages/admin/Login'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const ContentCMS = lazy(() => import('./pages/admin/ContentCMS'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Notifications = lazy(() => import('./pages/admin/Notifications'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));

const LENIS_PRESETS = {
  public: {
    key: 'home-public',
    mode: 'desktop',
    options: {
      lerp: 0.09,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.9,
      touchMultiplier: 1,
      autoResize: true,
      infinite: false
    }
  },
  admin: {
    key: 'admin-general',
    mode: 'desktop',
    options: {
      lerp: 0.12,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.8,
      touchMultiplier: 1,
      autoResize: true,
      infinite: false
    }
  },
  adminHeavy: {
    key: 'admin-analytics-heavy',
    mode: 'desktop-heavy',
    options: {
      lerp: 0.16,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.72,
      touchMultiplier: 1,
      autoResize: true,
      infinite: false
    }
  }
};

const resolveLenisPreset = (pathname = '/') => {
  if (pathname.startsWith('/admin/analytics')) return LENIS_PRESETS.adminHeavy;
  if (pathname.startsWith('/admin')) return LENIS_PRESETS.admin;
  return LENIS_PRESETS.public;
};

const MainContent = () => {
  const { isLoading } = useLoading();
  const location = useLocation();
  const [visitIdState, setVisitIdState] = useState(() => sessionStorage.getItem('portfolioVisitId'));
  const sessionStartRef = useRef(Date.now());

  useEffect(() => {
    if (!window.lenis) return;
    if (isLoading) {
      window.lenis.stop();
      return;
    }
    window.lenis.start();
  }, [isLoading]);

  // Scroll to top on route change.
  useEffect(() => {
    if (window.lenis) {
      window.lenis.scrollTo(0, { immediate: true, force: true });
      window.lenis.resize?.();
      return;
    }
    window.scrollTo(0, 0);
  }, [location]);

  // Track one session per tab and keep its duration updated.
  useEffect(() => {
    if (isLoading || visitIdState) return;
    if (location.pathname.startsWith('/admin')) return;

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAgent: navigator.userAgent,
        pageViewed: location.pathname,
        reelId: null
      })
    })
      .then((res) => res.json())
      .then((data) => {
        const id = (data && (data.visitId || data.visit_id || data.id)) || null;
        if (id) {
          sessionStorage.setItem('portfolioVisitId', String(id));
          setVisitIdState(String(id));
          sessionStartRef.current = Date.now();
        }
      })
      .catch((err) => console.error('Tracking failed', err));
  }, [isLoading, location.pathname, visitIdState]);

  // Update visited page path within the active session.
  useEffect(() => {
    if (isLoading || !visitIdState) return;
    if (location.pathname.startsWith('/admin')) return;

    fetch('/api/track/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitId: visitIdState,
        pageViewed: location.pathname
      })
    }).catch(() => {});
  }, [isLoading, location.pathname, visitIdState]);

  // Session duration heartbeat - runs when we have a visitId.
  useEffect(() => {
    if (!visitIdState) return;

    const sendHeartbeat = (keepalive = false) => {
      const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      fetch('/api/track/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive,
        body: JSON.stringify({
          visitId: visitIdState,
          duration,
          sessionStartedAt: new Date(sessionStartRef.current).toISOString()
        })
      })
        .then((response) => response.json().catch(() => null))
        .then((payload) => {
          if (payload?.resetVisit) {
            sessionStorage.removeItem('portfolioVisitId');
            setVisitIdState(null);
            sessionStartRef.current = Date.now();
          }
        })
        .catch(() => {});
    };

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(false);
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sendHeartbeat(true);
      }
    };

    const handlePageExit = () => sendHeartbeat(true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handlePageExit);
    window.addEventListener('pagehide', handlePageExit);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handlePageExit);
      window.removeEventListener('pagehide', handlePageExit);
    };
  }, [visitIdState]);

  return (
    <>
      <AnimatePresence mode="wait">{isLoading && <Preloader />}</AnimatePresence>

      {!isLoading && (
        <Suspense
          fallback={(
            <div className="min-h-screen flex items-center justify-center text-white/70">
              Loading page...
            </div>
          )}
        >
          <Routes location={location} key={location.pathname}>
            <Route index element={<Home />} />
            <Route path="/reels" element={<AllReels />} />
            <Route path="/project/:slug" element={<Project />} />
            <Route path="/mishwa-zalavadiya-video-editor-portfolio" element={<SeoLanding />} />
            <Route path="/mishwa-zalavadiya-portfolio" element={<SeoLanding />} />
            <Route path="/surat-video-editor-portfolio" element={<SeoLanding />} />

            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="content" element={<ContentCMS />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      )}
    </>
  );
};

const LenisManager = () => {
  const location = useLocation();
  const profile = useDeviceProfile();
  const lenisRef = useRef(null);
  const rafRef = useRef(0);
  const presetKeyRef = useRef('off');

  const preset = useMemo(() => resolveLenisPreset(location.pathname), [location.pathname]);
  const targetPresetKey = profile.allowLenis ? preset.key : 'off';
  const targetMode = profile.allowLenis ? preset.mode : 'off';

  const publishProfile = useCallback((overrides = {}) => {
    window.lenisProfile = Object.freeze({
      ...profile,
      activeRoute: location.pathname,
      activePresetKey: presetKeyRef.current,
      lenisActive: Boolean(lenisRef.current),
      ...overrides
    });
  }, [location.pathname, profile]);

  const destroyLenis = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    if (lenisRef.current && typeof lenisRef.current.destroy === 'function') {
      lenisRef.current.destroy();
    }

    if (window.lenis && typeof window.lenis.destroy === 'function') {
      window.lenis.destroy();
    }

    lenisRef.current = null;
    window.lenis = null;
    presetKeyRef.current = 'off';
  }, []);

  useEffect(() => () => {
    destroyLenis();
    delete window.lenisProfile;
  }, [destroyLenis]);

  useEffect(() => {
    let cancelled = false;

    const setupLenis = async () => {
      if (!profile.allowLenis) {
        destroyLenis();
        publishProfile({ activePresetKey: 'off', lenisMode: 'off', lenisActive: false });
        return;
      }

      if (lenisRef.current && presetKeyRef.current === preset.key) {
        publishProfile({ activePresetKey: preset.key, lenisMode: preset.mode, lenisActive: true });
        return;
      }

      const currentScroll = window.scrollY;

      try {
        const lenisModule = await import('lenis');
        if (cancelled) return;

        const Lenis = lenisModule?.default || lenisModule?.Lenis;
        if (typeof Lenis !== 'function') {
          throw new Error('Lenis constructor not found in module.');
        }

        destroyLenis();

        const lenis = new Lenis(preset.options);
        lenisRef.current = lenis;
        window.lenis = lenis;
        presetKeyRef.current = preset.key;

        const raf = (time) => {
          if (!lenisRef.current) return;
          lenisRef.current.raf(time);
          rafRef.current = requestAnimationFrame(raf);
        };

        rafRef.current = requestAnimationFrame(raf);
        lenis.scrollTo(currentScroll, { immediate: true, force: true });

        publishProfile({ activePresetKey: preset.key, lenisMode: preset.mode, lenisActive: true });
      } catch (error) {
        console.error('Lenis init failed, using native scroll fallback:', error);
        destroyLenis();
        publishProfile({
          activePresetKey: targetPresetKey,
          lenisMode: targetMode,
          lenisActive: false,
          lenisError: String(error?.message || error)
        });
      }
    };

    setupLenis();

    return () => {
      cancelled = true;
    };
  }, [destroyLenis, preset, profile.allowLenis, publishProfile, targetMode, targetPresetKey]);

  useEffect(() => {
    publishProfile({
      activePresetKey: targetPresetKey,
      lenisMode: targetMode,
      lenisActive: Boolean(lenisRef.current)
    });
  }, [publishProfile, targetMode, targetPresetKey]);

  return null;
};

const AppShell = () => {
  const { perfMode } = useDeviceProfile();

  return (
    <Router>
      <ContentProvider>
        <LoadingProvider>
          <LenisManager />
          <div className="bg-background min-h-screen text-text selection:bg-secondary selection:text-background">
            {perfMode !== 'lite' && (
              <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#112240] via-background to-background opacity-50"></div>
              </div>
            )}
            <div className="relative z-10">
              <MainContent />
            </div>
          </div>
        </LoadingProvider>
      </ContentProvider>
    </Router>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <DeviceProfileProvider>
        <AppShell />
      </DeviceProfileProvider>
    </ErrorBoundary>
  );
}

export default App;
