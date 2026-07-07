import { useRef, useState } from 'react';
import { exportSettings, importSettings } from '@/storage/import-export';
import type { AppSettings } from '@/storage/schema';

interface Props {
  settings: AppSettings;
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BackupPanel({ settings }: Props) {
  const [includeKeys, setIncludeKeys] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    download('llm-translate-settings.json', exportSettings(settings, includeKeys));
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setError('');
    try {
      await importSettings(await file.text());
      window.location.reload(); // reflect the imported settings
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="defaults">
      <div className="field">
        <span className="field__label">Export</span>
        <span className="field__hint">Download your settings as a JSON file.</span>
        <label className="radio">
          <input
            type="checkbox"
            checked={includeKeys}
            onChange={(e) => setIncludeKeys(e.target.checked)}
          />
          <span className="radio__body">
            <span className="radio__label">Include API keys</span>
            <span className="radio__hint">
              Off by default — the file would hold your keys in plain text.
            </span>
          </span>
        </label>
        <div>
          <button type="button" className="btn btn--ghost" onClick={handleExport}>
            Export settings
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Import</span>
        <span className="field__hint">Replace all settings from an exported file.</span>
        <div>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Import settings…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleFile}
          />
        </div>
        {error && <span className="status status--error">{error}</span>}
      </div>
    </div>
  );
}
