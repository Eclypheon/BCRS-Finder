import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

// Register service worker with aggressive auto-update for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Force skip waiting to immediately switch to new version
      updateSW(true);
    },
    onRegisteredSW(_swScriptUrl, registration) {
      if (registration) {
        // Auto-check for updates whenever user returns to the app
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
        window.addEventListener('focus', () => {
          registration.update().catch(() => {});
        });
      }
    },
  });

  // Reload the client when the new service worker takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Disable long-press context menu across the webapp, preserving native input editing
window.addEventListener('contextmenu', (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    return;
  }
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
