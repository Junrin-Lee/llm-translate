import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/brand';
import { cropToAttachment } from '@/capture/crop';
import { takePendingCapture } from '@/capture/session';
import { setUiLanguage } from '@/i18n';
import { useT } from '@/i18n/useI18n';
import type { ImageAttachment } from '@/llm/types';
import { getImageNoticeSeen, getSettings, setImageNoticeSeen, updateSettings } from '@/storage';
import { CropOverlay } from '@/ui/image/CropOverlay';
import { ImageResultPanel } from '@/ui/image/ImageResultPanel';

type Stage =
  | { kind: 'empty' }
  | { kind: 'select'; imageDataUrl: string }
  | { kind: 'result'; imageDataUrl: string; attachment: ImageAttachment };

export function App() {
  const t = useT();
  const [stage, setStage] = useState<Stage>({ kind: 'empty' });
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [noticeSeen, setNoticeSeen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = BRAND.name;
    void (async () => {
      const settings = await getSettings();
      setUiLanguage(settings.general.uiLang);
      setTargetLang(settings.general.targetLang);
      setNoticeSeen(await getImageNoticeSeen());
      const pending = await takePendingCapture();
      if (pending) setStage({ kind: 'select', imageDataUrl: pending });
    })();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: acceptFile only calls setStage — no stale-closure risk.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (file) void acceptFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  async function acceptFile(file: Blob) {
    try {
      // Uploaded images translate whole by default; the crop stage still allows
      // narrowing, so route them through select for consistency.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      setStage({ kind: 'select', imageDataUrl: dataUrl });
    } catch (error) {
      console.warn('Image Translation: could not read file', error);
    }
  }

  const dismissNotice = () => {
    setNoticeSeen(true);
    void setImageNoticeSeen();
  };

  return (
    <main
      className="wb"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (file) void acceptFile(file);
      }}
    >
      <h1 className="wb__title">{t('imageTranslate')}</h1>

      {stage.kind === 'empty' ? (
        <div className="wb__empty">
          <p>{t('imageWorkbenchEmpty')}</p>
          <button type="button" className="wb__btn" onClick={() => fileRef.current?.click()}>
            {t('imageUpload')}
          </button>
        </div>
      ) : (
        <div className="wb__stage">
          <img className="wb__preview" src={stage.imageDataUrl} alt="" draggable={false} />
          {stage.kind === 'select' && (
            <CropOverlay
              imageUrl={stage.imageDataUrl}
              showNotice={!noticeSeen}
              onNoticeDismiss={dismissNotice}
              onCancel={() => setStage({ kind: 'empty' })}
              onConfirm={(region, container) => {
                void cropToAttachment(stage.imageDataUrl, region, container)
                  .then((attachment) =>
                    setStage({ kind: 'result', imageDataUrl: stage.imageDataUrl, attachment }),
                  )
                  .catch((error) => {
                    // Keep the select stage: the user can re-drag or cancel.
                    console.warn('Image Translation: crop failed', error);
                  });
              }}
            />
          )}
        </div>
      )}

      {stage.kind === 'result' && (
        <>
          <div className="wb__bar">
            <button
              type="button"
              className="wb__btn"
              onClick={() => setStage({ kind: 'select', imageDataUrl: stage.imageDataUrl })}
            >
              {t('imageReselect')}
            </button>
          </div>
          <ImageResultPanel
            image={stage.attachment}
            targetLang={targetLang}
            onTargetLangChange={(code) => {
              setTargetLang(code);
              void getSettings().then((s) =>
                updateSettings({ general: { ...s.general, targetLang: code } }),
              );
            }}
            onOpenSettings={() =>
              void browser.tabs.create({
                url: browser.runtime.getURL('/options.html') + '#routing',
              })
            }
            onClose={() => setStage({ kind: 'select', imageDataUrl: stage.imageDataUrl })}
          />
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void acceptFile(file);
          e.target.value = '';
        }}
      />
    </main>
  );
}
