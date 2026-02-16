import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getDeviceProfile } from '../utils/deviceProfile';

const DeviceProfileContext = createContext(null);

export const useDeviceProfile = () => {
  const ctx = useContext(DeviceProfileContext);
  if (ctx) return ctx;
  return {
    ua: '',
    isTouch: false,
    isIOS: false,
    prefersReducedMotion: false,
    perfMode: 'full'
  };
};

export const DeviceProfileProvider = ({ children }) => {
  const [profile] = useState(() => getDeviceProfile());

  useEffect(() => {
    document.documentElement.dataset.perf = profile.perfMode;
    return () => {
      document.documentElement.dataset.perf = 'full';
    };
  }, [profile.perfMode]);

  const value = useMemo(() => profile, [profile]);

  return <DeviceProfileContext.Provider value={value}>{children}</DeviceProfileContext.Provider>;
};

