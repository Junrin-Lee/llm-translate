import { useEffect } from 'react';
import { BRAND } from '@/brand';

export function App() {
  useEffect(() => {
    document.title = BRAND.name;
  }, []);

  return (
    <main className="popup">
      <h1 className="popup__title">{BRAND.name}</h1>
      <p className="popup__hint">
        Configure your provider in settings, then select text on any page to translate. Page
        translation controls arrive in a later milestone.
      </p>
      <button
        type="button"
        className="popup__btn"
        onClick={() => browser.runtime.openOptionsPage()}
      >
        Open settings
      </button>
    </main>
  );
}
