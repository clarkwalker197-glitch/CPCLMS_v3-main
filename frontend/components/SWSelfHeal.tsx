'use client';

import { useEffect } from 'react';

export function SWSelfHeal() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const expectedScript = '/sw.js';

    const unregisterBrokenRegistrations = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();

      for (const registration of registrations) {
        const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '';
        const isBroken =
          !scriptUrl ||
          scriptUrl.includes('undefined') ||
          scriptUrl.includes('404') ||
          (!scriptUrl.endsWith(expectedScript) && !scriptUrl.includes('/_next/static/'));

        if (isBroken) {
          await registration.unregister();
        }
      }
    };

    void unregisterBrokenRegistrations();
  }, []);

  return null;
}
