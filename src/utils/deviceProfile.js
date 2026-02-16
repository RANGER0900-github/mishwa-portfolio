export function getDeviceProfile() {
  const ua = navigator.userAgent || '';

  const isTouch =
    (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
    (navigator.maxTouchPoints ?? 0) > 0;

  // iPadOS often reports as Mac; touch points distinguishes it.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && (navigator.maxTouchPoints ?? 0) > 1);

  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let perfMode = prefersReducedMotion ? 'lite' : isIOS && isTouch ? 'lite' : 'full';

  // Debug override: ?perf=lite | ?perf=full
  try {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('perf');
    if (override === 'lite' || override === 'full') {
      perfMode = override;
    }
  } catch {
    // ignore
  }

  return {
    ua,
    isTouch,
    isIOS,
    prefersReducedMotion,
    perfMode
  };
}

