import { useEffect, useState } from 'react';
import type { ContentMessage } from '@/messaging/protocol';
import { classifySelection } from '@/selection/classify';
import { getSettings, updateSettings, watchSettings } from '@/storage';
import type { AppSettings } from '@/storage/schema';
import { TranslatePanel } from './TranslatePanel';
import { readSelectionTarget, useSelectionTarget } from './useSelection';

interface Active {
  text: string;
  rect: DOMRect;
}

export function SelectionApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const target = useSelectionTarget();

  useEffect(() => {
    getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  // Keyboard shortcut / context menu: open the panel for the current selection.
  useEffect(() => {
    const listener = (message: ContentMessage) => {
      if (message?.type === 'open-selection-panel') {
        const current = readSelectionTarget();
        if (current) setActive({ text: current.text, rect: current.rect });
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const disabled = settings?.siteRules.disableSelection.includes(location.hostname) ?? false;
  const trigger = settings?.general.selectionTrigger ?? 'icon';

  // Instant mode opens the panel as soon as a selection appears.
  useEffect(() => {
    if (trigger === 'instant' && target && !disabled) {
      setActive({ text: target.text, rect: target.rect });
    }
  }, [trigger, target, disabled]);

  if (!settings || disabled) return null;

  const showIcon = trigger === 'icon' && target !== null && active === null;

  return (
    <>
      {showIcon && target && (
        <button
          type="button"
          className="llmt-icon"
          style={{
            top: `${target.rect.bottom + 6}px`,
            left: `${Math.min(target.rect.right, window.innerWidth - 40)}px`,
          }}
          // Keep the selection alive through the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setActive({ text: target.text, rect: target.rect })}
          aria-label="Translate selection"
        >
          文
        </button>
      )}
      {active && (
        <TranslatePanel
          text={active.text}
          rect={active.rect}
          targetLang={settings.general.targetLang}
          initialMode={classifySelection(active.text)}
          onClose={() => setActive(null)}
          onTargetLangChange={(code) =>
            updateSettings({ general: { ...settings.general, targetLang: code } })
          }
        />
      )}
    </>
  );
}
