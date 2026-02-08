import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Lenis from '@studio-freight/lenis';
import { LoadingProvider, useLoading } from './context/LoadingContext';
import { ContentProvider } from './context/ContentContext';
import ErrorBoundary from './components/ErrorBoundary';
import Preloader from './components/Preloader';
import { AnimatePresence } from 'framer-motion';

const Home = lazy(() => import('./pages/Home'));
const AllReels = lazy(() => import('./pages/AllReels'));
const Login = lazy(() => import('./pages/admin/Login'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const ContentCMS = lazy(() => import('./pages/admin/ContentCMS'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Notifications = lazy(() => import('./pages/admin/Notifications'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));

const createLenisConfig = () => {
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  return {
    duration: isTouchDevice ? 0.9 : 1.05,
    easing: (t) => 1 - Math.pow(1 - t, 4),
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    smoothTouch: isTouchDevice,
    syncTouch: isTouchDevice,
    syncTouchLerp: 0.11,
    touchMultiplier: isTouchDevice ? 1.08 : 1,
    wheelMultiplier: isTouchDevice ? 0.9 : 0.95,
    infinite: false,
    // Keep nested scrollable areas (tables/modals/dropdowns) native.
    prevent: (node) => node?.closest?.('[data-lenis-prevent]') ?? false
  };
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

  // Scroll to new page top on route change
  useEffect(() => {
    if (window.lenis) {
      window.lenis.scrollTo(0, { immediate: true });
      window.lenis.resize?.();
      return;
    }
    window.scrollTo(0, 0);
  }, [location]);

  // Track one session per tab and keep its duration updated
  useEffect(() => {
    if (isLoading || visitIdState) return;

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAgent: navigator.userAgent,
        pageViewed: location.pathname,
        reelId: null
      })
    })
      .then(res => res.json())
      .then(data => {
        const id = (data && (data.visitId || data.visit_id || data.id)) || null;
        if (id) {
          sessionStorage.setItem('portfolioVisitId', String(id));
          setVisitIdState(String(id));
          sessionStartRef.current = Date.now();
        }
      })
      .catch(err => console.error('Tracking failed', err));
  }, [location.pathname, isLoading, visitIdState]);

  // Session duration heartbeat — runs when we have a visitId
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
          duration
        })
      }).catch(() => { });
    };

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(false);
    }, 10000); // Every 10 seconds

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
      <AnimatePresence mode="wait">
        {isLoading && <Preloader />}
      </AnimatePresence>

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

            {/* Admin Routes */}
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="content" element={<ContentCMS />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>
          </Routes>
        </Suspense>
      )}
    </>
  );
};

function App() {
  const lenisRef = useRef(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return undefined;

    if (window.lenis && typeof window.lenis.destroy === 'function') {
      window.lenis.destroy();
      window.lenis = null;
    }

    const lenis = new Lenis(createLenisConfig());

    lenisRef.current = lenis;
    window.lenis = lenis;
    let rafId = 0;

    function raf(time) {
      if (!lenisRef.current) return;
      lenisRef.current.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    const handleResize = () => {
      lenis.resize?.();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      lenis.destroy();
      lenisRef.current = null;
      if (window.lenis === lenis) {
        window.lenis = null;
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <ContentProvider>
          <LoadingProvider>
            <div className="bg-background min-h-screen text-text selection:bg-secondary selection:text-background">
              <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#112240] via-background to-background opacity-50"></div>
              </div>
              <MainContent />
            </div>
          </LoadingProvider>
        </ContentProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
