import { useRef, useState } from 'react';
import { useT } from '@/i18n/useI18n';
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
  const t = useT();
  const [includeKeys, setIncludeKeys] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    download('llm-translate-settings.json', exportSettings(settings, includeKeys));
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      await importSettings(await file.text());
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('backupImportFailed'));
    }
  }

  return (
    <div className="defaults">
      <div className="field">
        <span className="field__label">{t('backupExport')}</span>
        <span className="field__hint">{t('backupExportHint')}</span>
        <label className="radio">
          <input
            type="checkbox"
            checked={includeKeys}
            onChange={(e) => setIncludeKeys(e.target.checked)}
          />
          <span className="radio__body">
            <span className="radio__label">{t('backupIncludeKeys')}</span>
            <span className="radio__hint">{t('backupIncludeKeysHint')}</span>
          </span>
        </label>
        <div>
          <button type="button" className="btn btn--ghost" onClick={handleExport}>
            {t('backupExportBtn')}
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label">{t('backupImport')}</span>
        <span className="field__hint">{t('backupImportHint')}</span>
        <div>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            {t('backupImportBtn')}
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
