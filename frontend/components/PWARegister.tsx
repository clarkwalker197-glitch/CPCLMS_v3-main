'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        if (registration.installing) {
          console.info('PWA service worker installing...');
        }
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    void register();
  }, []);

  return null;
}
