import React, { useEffect, useMemo } from 'react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import legacyDocument from '../../index.html?raw';

const bodyMarkup = legacyDocument
  .match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  .replace(/<script[\s\S]*?<\/script>/gi, '') || '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-budo-script="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.budoScript = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.body.appendChild(script);
  });
}

export default function MainStudio() {
  const markup = useMemo(() => ({ __html: bodyMarkup }), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        window.BudoFabricLoader = window.BudoFabricLoader || (() => import('fabric').then(module => { window.BudoFabric = module; return module; }));
        // Reuse the bundled Supabase client. The old runtime CDN dependency was
        // unreliable on some mobile networks and left the backend gate stuck.
        window.supabase = window.supabase || { createClient: createSupabaseClient };
        await loadScript('/vendor/jszip.min.js');
        await loadScript('/legacy-config.js');
        if (active) await loadScript('/app.js');
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
