import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    const swUrl = `${base.replace(/\/$/, '')}/sw.js`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.log('SW registration error:', err);
    });
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
