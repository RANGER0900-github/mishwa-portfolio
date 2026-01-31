import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Lenis from '@studio-freight/lenis';
import { LoadingProvider, useLoading } from './context/LoadingContext';
import { ContentProvider } from './context/ContentContext';
import ErrorBoundary from './components/ErrorBoundary';
import Preloader from './components/Preloader';
import Home from './pages/Home';
import AllReels from './pages/AllReels';
import Login from './pages/admin/Login';
import Dashboard from './pages/admin/Dashboard';
import ContentCMS from './pages/admin/ContentCMS';
import Analytics from './pages/admin/Analytics';
import Settings from './pages/admin/Settings';
import Notifications from './pages/admin/Notifications';
import AdminLayout from './layouts/AdminLayout';
import { AnimatePresence } from 'framer-motion';

const MainContent = () => {
  const { isLoading } = useLoading();
  const location = useLocation();
  const visitIdRef = useRef(null);
    const [visitIdState, setVisitIdState] = useState(null);
  const sessionStartRef = useRef(Date.now());

  // Scroll to new page top on route change
  useEffect(() => {
    if (window.lenis) {
      window.lenis.scrollTo(0, { immediate: true });
    }
    window.scrollTo(0, 0);
  }, [location]);

  // ENHANCED TRACKING LOGIC
  useEffect(() => {
    if (!isLoading) {
      // Track page visit with enhanced data
      // Avoid duplicate tracking for same pathname during a single session
      const trackedKey = `tracked:${location.pathname}`;
      if (window[trackedKey]) return;
      window[trackedKey] = true;

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
          // Accept visitId from server regardless of source
          const id = (data && (data.visitId || data.visit_id || data.id)) || null;
          if (id) {
            visitIdRef.current = id;
            setVisitIdState(id);
            sessionStartRef.current = Date.now();
          }
        })
        .catch(err => console.error("Tracking failed", err));
    }
  }, [location, isLoading]);

  // Session duration heartbeat — runs when we have a visitId
  useEffect(() => {
    if (!visitIdState) return;

    const heartbeatInterval = setInterval(() => {
      const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      fetch('/api/track/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitId: visitIdState,
          duration
        })
      }).catch(() => { });
    }, 30000); // Every 30 seconds

    // Send final duration on page unload
    const handleUnload = () => {
      const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      navigator.sendBeacon('/api/track/heartbeat', JSON.stringify({
        visitId: visitIdState,
        duration
      }));
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [visitIdState]);

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && <Preloader />}
      </AnimatePresence>

      {!isLoading && (
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
      )}
    </>
  );
};

function App() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      mouseMultiplier: 1,
      smoothTouch: false,
      touchMultiplier: 2,
      infinite: false,
    });

    window.lenis = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
      window.lenis = null;
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
