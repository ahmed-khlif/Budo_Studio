import React, { useEffect, useMemo } from 'react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import legacyDocument from '../../index.html?raw';

const bodyMarkup = legacyDocument
  .match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  .replace(/<script[\s\S]*?<\/script>/gi, '') || '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-budo-script="${src}"]`)) return resolve(false);
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.budoScript = src;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.body.appendChild(script);
  });
}

export default function MainStudio({ authClient }) {
  // Keep this entry in the deployment diff when root runtime assets change.
  // The runtime gate also allows the editor to open when optional AI services are offline.
  const markup = useMemo(() => ({ __html: bodyMarkup }), []);

  useEffect(() => {
    let active = true;
    window.__BUDO_RUNTIME_MARKER = 'classic-editor-gate-v2';
    if (authClient) window.BudoAuthClient = authClient;
    (async () => {
      try {
        window.BudoFabricLoader = window.BudoFabricLoader || (() => import('fabric').then(module => { window.BudoFabric = module; return module; }));
        // Reuse the bundled Supabase client. The old runtime CDN dependency was
        // unreliable on some mobile networks and left the backend gate stuck.
        window.supabase = window.supabase || { createClient: createSupabaseClient };
        await loadScript('/vendor/jszip.min.js');
        await loadScript('/legacy-config.js');
        const runtimeAlreadyLoaded = Boolean(document.querySelector('script[data-budo-script="/app.js"]'));
        if (active) await loadScript('/app.js');
        // AuthGate unmounts this view on logout. On the next sign-in, the
        // classic runtime script is already present, so explicitly rebind it
        // to the newly mounted application DOM.
        if (active && runtimeAlreadyLoaded) await window.BudoStudioInitialize?.();
      } catch (error) {
        const toast = document.querySelector('#toast-root');
        if (toast) toast.textContent = error.message;
        console.error('BUDO Studio initialization failed', error);
      }
    })();
    return () => { active = false; };
  }, []);

  return <div className="budo-react-main" dangerouslySetInnerHTML={markup} />;
}
