import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getDeviceProfile } from '../utils/deviceProfile';

const DeviceProfileContext = createContext(null);

export const useDeviceProfile = () => {
  const ctx = useContext(DeviceProfileContext);
  if (ctx) return ctx;
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
};

export const DeviceProfileProvider = ({ children }) => {
  const [profile] = useState(() => getDeviceProfile());

  useEffect(() => {
    document.documentElement.dataset.perf = profile.perfMode;
    window.lenisProfile = Object.freeze({ ...profile, activePresetKey: 'off', activeRoute: window.location.pathname });
    return () => {
      document.documentElement.dataset.perf = 'full';
      delete window.lenisProfile;
    };
  }, [profile]);

  const value = useMemo(() => profile, [profile]);

  return <DeviceProfileContext.Provider value={value}>{children}</DeviceProfileContext.Provider>;
};
