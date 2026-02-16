export function getDeviceProfile() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      ua: '',
      isTouch: false,
      hasFinePointer: true,
      hasCoarsePointer: false,
      isDesktopLike: true,
      isMobileLike: false,
      isIOS: false,
      prefersReducedMotion: false,
      perfMode: 'full',
      allowLenis: true,
      lenisMode: 'desktop',
      lenisOverride: null
    };
  }

  const ua = navigator.userAgent || '';

  const queryMatch = (query) => window.matchMedia?.(query).matches ?? false;

  const hasFinePointer = queryMatch('(pointer: fine)') || queryMatch('(any-pointer: fine)');
  const hasCoarsePointer = queryMatch('(pointer: coarse)') || queryMatch('(any-pointer: coarse)');
  const isTouch = hasCoarsePointer || (navigator.maxTouchPoints ?? 0) > 0;

  // iPadOS often reports as Mac; touch points distinguishes it.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && (navigator.maxTouchPoints ?? 0) > 1);

  const isDesktopLike = hasFinePointer && !isIOS;
  const isMobileLike = hasCoarsePointer && !hasFinePointer;
  const prefersReducedMotion = queryMatch('(prefers-reduced-motion: reduce)');

  let perfMode = prefersReducedMotion || isIOS ? 'lite' : 'full';
  let lenisOverride = null;

  // Debug overrides: ?perf=lite|full and ?lenis=on|off
  try {
    const params = new URLSearchParams(window.location.search);
    const perfOverride = params.get('perf');
    if (perfOverride === 'lite' || perfOverride === 'full') {
      perfMode = perfOverride;
    }

    const nextLenisOverride = params.get('lenis');
    if (nextLenisOverride === 'on' || nextLenisOverride === 'off') {
      lenisOverride = nextLenisOverride;
    }
  } catch {
    // ignore
  }

  let allowLenis = false;
  if (lenisOverride === 'off') {
    allowLenis = false;
  } else if (prefersReducedMotion) {
    // Accessibility wins even when ?lenis=on is present.
    allowLenis = false;
  } else if (lenisOverride === 'on') {
    allowLenis = true;
  } else if (isIOS) {
    allowLenis = false;
  } else if (isDesktopLike) {
    allowLenis = true;
  }

  const lenisMode = allowLenis ? 'desktop' : 'off';

  return {
    ua,
    isTouch,
    hasFinePointer,
    hasCoarsePointer,
    isDesktopLike,
    isMobileLike,
    isIOS,
    prefersReducedMotion,
    perfMode,
    allowLenis,
    lenisMode,
    lenisOverride
  };
}
