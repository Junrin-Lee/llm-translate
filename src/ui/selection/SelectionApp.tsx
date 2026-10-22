import { useEffect, useState } from 'react';
import { setUiLanguage } from '@/i18n';
import { useT } from '@/i18n/useI18n';
import type { ContentMessage } from '@/messaging/protocol';
import { classifySelection } from '@/selection/classify';
import { getSettings, updateSettings, watchSettings } from '@/storage';
import type { AppSettings } from '@/storage/schema';
import { TranslatePanel } from './TranslatePanel';
import { readSelectionTarget, useSelectionTarget } from './useSelection';

interface Active {
  text: string;
  rect: DOMRect;
  /** Opened from the search icon: the panel starts on, and only then shows, Search. */
  search?: boolean;
}

/** Icon width (26px) plus a 4px gap; the search icon sits one step right. */
const ICON_STEP = 30;

export function SelectionApp() {
  const t = useT();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const target = useSelectionTarget();

  useEffect(() => {
    const apply = (s: AppSettings) => {
      setSettings(s);
      setUiLanguage(s.general.uiLang);
    };
    getSettings().then(apply);
    return watchSettings(apply);
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
  const showSearchIcon = showIcon && settings.general.selectionSearch === true;
  // Keep both icons on screen near the right edge by shifting the pair left.
  const iconLeft = target
    ? Math.min(target.rect.right, window.innerWidth - 40 - (showSearchIcon ? ICON_STEP : 0))
    : 0;

  return (
    <>
      {showIcon && target && (
        <button
          type="button"
          className="llmt-icon"
          style={{
            top: `${target.rect.bottom + 6}px`,
            left: `${iconLeft}px`,
          }}
          // Keep the selection alive through the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setActive({ text: target.text, rect: target.rect })}
          aria-label={t('iconTranslateSelection')}
        >
          文
        </button>
      )}
      {showSearchIcon && target && (
        <button
          type="button"
          className="llmt-icon llmt-icon--search"
          style={{ top: `${target.rect.bottom + 6}px`, left: `${iconLeft + ICON_STEP}px` }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setActive({ text: target.text, rect: target.rect, search: true })}
          aria-label={t('iconSearchSelection')}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M10.5 10.5L14 14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
      {active && (
        <TranslatePanel
          text={active.text}
          rect={active.rect}
          targetLang={settings.general.targetLang}
          initialMode={active.search ? 'search' : classifySelection(active.text)}
          showSearch={active.search}
          onClose={() => setActive(null)}
          onTargetLangChange={(code) =>
            updateSettings({ general: { ...settings.general, targetLang: code } })
          }
        />
      )}
    </>
  );
}
