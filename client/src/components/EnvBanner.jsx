// Orange strip shown on the test site so nobody mistakes it for the real workshop system.
import { useEffect, useState } from 'react';

let cached = null;
function loadEnv() {
  if (!cached) {
    cached = fetch('/api/health')
      .then((r) => r.json())
      .then((d) => d.env || 'production')
      .catch(() => 'production');
  }
  return cached;
}

export function useDeployEnv() {
  const [env, setEnv] = useState('production');
  useEffect(() => {
    let live = true;
    loadEnv().then((e) => {
      if (!live) return;
      setEnv(e);
      if (e === 'staging' && !document.title.startsWith('[TEST]')) document.title = `[TEST] ${document.title}`;
    });
    return () => { live = false; };
  }, []);
  return env;
}

export default function EnvBanner() {
  const env = useDeployEnv();
  if (env !== 'staging') return null;
  return (
    <div className="env-banner" role="status">
      TEST SITE – practice copy. Nothing here affects the real workshop, and no WhatsApp/SMS messages are sent.
    </div>
  );
}
