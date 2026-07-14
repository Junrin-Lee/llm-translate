import { useEffect, useState } from 'react';
import { cropToAttachment } from '@/capture/crop';
import type { Rect } from '@/capture/geometry';
import type { ImageAttachment } from '@/llm/types';
import type { ContentMessage, TabMessage } from '@/messaging/protocol';
import { getImageNoticeSeen, getSettings, setImageNoticeSeen, updateSettings } from '@/storage';
import { CropOverlay } from './CropOverlay';
import { ImageResultPanel } from './ImageResultPanel';

type Stage =
  | { kind: 'idle' }
  | { kind: 'select'; imageDataUrl: string }
  | { kind: 'result'; attachment: ImageAttachment };

export function ImageCaptureApp() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [noticeSeen, setNoticeSeen] = useState(true);

  useEffect(() => {
    const onMessage = (message: ContentMessage) => {
      if (message?.type !== 'open-image-capture') return;
      void getSettings().then((s) => setTargetLang(s.general.targetLang));
      void getImageNoticeSeen().then(setNoticeSeen);
      setStage({ kind: 'select', imageDataUrl: message.imageDataUrl });
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  if (stage.kind === 'idle') return null;

  if (stage.kind === 'select') {
    return (
      <div className="llmt-capture-host">
        <CropOverlay
          imageUrl={stage.imageDataUrl}
          showNotice={!noticeSeen}
          onNoticeDismiss={() => {
            setNoticeSeen(true);
            void setImageNoticeSeen();
          }}
          onCancel={() => setStage({ kind: 'idle' })}
          onConfirm={(region: Rect, container) => {
            void cropToAttachment(stage.imageDataUrl, region, container).then((attachment) =>
              setStage({ kind: 'result', attachment }),
            );
          }}
        />
      </div>
    );
  }

  return (
    <ImageResultPanel
      image={stage.attachment}
      targetLang={targetLang}
      onTargetLangChange={(code) => {
        setTargetLang(code);
        // Persisting to the global default mirrors Selection Translation.
        void getSettings().then((s) =>
          updateSettings({ general: { ...s.general, targetLang: code } }),
        );
      }}
      onOpenSettings={() => {
        void browser.runtime.sendMessage({ type: 'open-options' } satisfies TabMessage);
      }}
      onClose={() => setStage({ kind: 'idle' })}
    />
  );
}
