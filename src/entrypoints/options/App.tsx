import { useEffect } from 'react';
import { BRAND } from '@/brand';

export function App() {
  useEffect(() => {
    document.title = `${BRAND.name} — Options`;
  }, []);

  return (
    <main className="options">
      <h1>{BRAND.name}</h1>
      <p className="options__hint">Provider management is wired up in M1.</p>
    </main>
  );
}
