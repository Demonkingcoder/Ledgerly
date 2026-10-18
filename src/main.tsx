import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LedgerProvider } from './app/ledger-context';
import { AppRoutes } from './app/routes';
import { ToastProvider } from './components/toast';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><LedgerProvider><ToastProvider><BrowserRouter><AppRoutes /></BrowserRouter></ToastProvider></LedgerProvider></React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
