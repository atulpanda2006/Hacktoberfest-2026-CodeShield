import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Initialize Golden Obsidian Telemetry Logging
if (typeof window !== 'undefined') {
  console.log(
    '%c✦ SYSTEM ONLINE %c| Golden Obsidian Architecture Initialized',
    'color: #10b981; font-weight: bold; font-size: 11px; font-family: monospace; border: 1px solid #10b981; padding: 2px 6px; border-radius: 4px;',
    'color: #f59e0b; font-size: 11px; font-family: monospace;'
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element to mount the application.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);