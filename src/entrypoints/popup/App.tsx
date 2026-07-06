import { useEffect } from 'react';
import { BRAND } from '@/brand';

export function App() {
  useEffect(() => {
    document.title = BRAND.name;
  }, []);

  return (
    <main className="popup">
      <h1>{BRAND.name}</h1>
      <p className="popup__hint">Popup controls are wired up in M3.</p>
    </main>
  );
}
