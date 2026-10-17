import { t } from '../shared/i18n';
import { LanguageProvider, useAppLanguage } from './LanguageProvider';
import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui.css';
const Capture = lazy(() => import('./Capture').then((m) => ({ default: m.Capture })));
const ImageTools = lazy(() => import('./ImageTools').then((m) => ({ default: m.ImageTools })));
const desktop = new URLSearchParams(location.search).get('desktop');
const SuperPanel = lazy(() =>
  import('./SuperPanel').then((module) => ({ default: module.SuperPanel })),
);
const isPanel = new URLSearchParams(location.search).get('panel') === '1';
function Application() {
  useAppLanguage();
  return (
    <>
      {desktop ? (
        <Suspense fallback={<div className="loading-screen">{t('正在打开…')}</div>}>
          {desktop === 'capture' ? <Capture /> : <ImageTools />}
        </Suspense>
      ) : isPanel ? (
        <Suspense fallback={<div className="loading-screen">{t('正在打开面板…')}</div>}>
          <SuperPanel />
        </Suspense>
      ) : (
        <App />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <Application />
    </LanguageProvider>
  </React.StrictMode>,
);
