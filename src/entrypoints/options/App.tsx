import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import { setUiLanguage } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import type { ProviderProfile } from '@/llm/types';
import type { GeneralSettings, ProfileDefaults, PromptOverrides } from '@/storage/schema';
import { PermissionBanner } from '@/ui/PermissionBanner';
import { BackupPanel } from './BackupPanel';
import { CachePanel } from './CachePanel';
import { DefaultsPanel } from './DefaultsPanel';
import { GeneralPanel } from './GeneralPanel';
import { PromptsPanel } from './PromptsPanel';
import { ProviderCard } from './ProviderCard';
import { useSettings } from './useSettings';

const SECTIONS = [
  { id: 'providers', key: 'navProviders' },
  { id: 'routing', key: 'navRouting' },
  { id: 'translation', key: 'navTranslation' },
  { id: 'prompts', key: 'navPrompts' },
  { id: 'backup', key: 'navBackup' },
  { id: 'cache', key: 'navCache' },
] as const satisfies ReadonlyArray<{ id: string; key: MessageKey }>;

type SectionId = (typeof SECTIONS)[number]['id'];

function sectionFromHash(): SectionId {
  const hash = location.hash.replace('#', '');
  return SECTIONS.some((s) => s.id === hash) ? (hash as SectionId) : 'providers';
}

function newProvider(): ProviderProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    protocol: 'openai',
    baseUrl: '',
    apiKey: '',
    model: '',
  };
}

export function App() {
  const { settings, mutate } = useSettings();
  const [active, setActive] = useState<SectionId>(sectionFromHash);
  const t = useT();

  useEffect(() => {
    document.title = `${BRAND.name} — Settings`;
  }, []);

  useEffect(() => {
    const onHashChange = () => setActive(sectionFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (settings) setUiLanguage(settings.general.uiLang);
  }, [settings]);

  if (!settings) {
    return <main className="page page--loading">…</main>;
  }

  const navigate = (id: SectionId) => {
    location.hash = id;
    setActive(id);
  };

  const addProvider = () =>
    mutate((s) => {
      const profile = newProvider();
      return {
        ...s,
        providers: [...s.providers, profile],
        defaults: s.providers.length === 0 ? { ...s.defaults, global: profile.id } : s.defaults,
      };
    });

  const patchProvider = (id: string, patch: Partial<ProviderProfile>) =>
    mutate((s) => ({
      ...s,
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const deleteProvider = (id: string) => {
    if (!confirm(t('confirmDeleteProvider'))) return;
    mutate((s) => {
      const providers = s.providers.filter((p) => p.id !== id);
      const defaults: ProfileDefaults = {
        global: s.defaults.global === id ? (providers[0]?.id ?? null) : s.defaults.global,
      };
      if (s.defaults.selection && s.defaults.selection !== id)
        defaults.selection = s.defaults.selection;
      if (s.defaults.page && s.defaults.page !== id) defaults.page = s.defaults.page;
      return { ...s, providers, defaults };
    });
  };

  const setDefaults = (defaults: ProfileDefaults) => mutate((s) => ({ ...s, defaults }));

  const setGeneral = (patch: Partial<GeneralSettings>) =>
    mutate((s) => ({ ...s, general: { ...s.general, ...patch } }));

  const setDisabledSites = (sites: string[]) =>
    mutate((s) => ({ ...s, siteRules: { ...s.siteRules, disableSelection: sites } }));

  const setPrompts = (prompts: PromptOverrides) => mutate((s) => ({ ...s, prompts }));

  const { providers, defaults } = settings;
  const activeKey = SECTIONS.find((s) => s.id === active)?.key ?? 'navProviders';

  return (
    <main className="page">
      <PermissionBanner />
      <header className="masthead">
        <h1 className="masthead__title">{BRAND.name}</h1>
        <p className="masthead__tagline">{t('optionsTagline')}</p>
      </header>

      <div className="layout">
        <nav className="sidenav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`sidenav__item${active === s.id ? ' is-active' : ''}`}
              aria-current={active === s.id ? 'page' : undefined}
              onClick={() => navigate(s.id)}
            >
              {t(s.key)}
            </button>
          ))}
        </nav>

        <div className="content">
          <div className="content__head">
            <h2 className="content__title">{t(activeKey)}</h2>
            {active === 'providers' && (
              <button type="button" className="btn btn--primary" onClick={addProvider}>
                {t('providersAdd')}
              </button>
            )}
          </div>

          {active === 'providers' &&
            (providers.length === 0 ? (
              <div className="empty">
                <p className="empty__title">{t('providersEmptyTitle')}</p>
                <p className="empty__body">{t('providersEmptyBody')}</p>
                <button type="button" className="btn btn--primary" onClick={addProvider}>
                  {t('providersAddFirst')}
                </button>
              </div>
            ) : (
              <div className="cards">
                {providers.map((profile) => (
                  <ProviderCard
                    key={profile.id}
                    profile={profile}
                    isGlobalDefault={defaults.global === profile.id}
                    onPatch={(patch) => patchProvider(profile.id, patch)}
                    onDelete={() => deleteProvider(profile.id)}
                  />
                ))}
              </div>
            ))}

          {active === 'routing' && (
            <DefaultsPanel providers={providers} defaults={defaults} onChange={setDefaults} />
          )}

          {active === 'translation' && (
            <GeneralPanel
              general={settings.general}
              disabledSites={settings.siteRules.disableSelection}
              onGeneral={setGeneral}
              onDisabledSites={setDisabledSites}
            />
          )}

          {active === 'prompts' && (
            <PromptsPanel prompts={settings.prompts} onChange={setPrompts} />
          )}

          {active === 'backup' && <BackupPanel settings={settings} />}

          {active === 'cache' && <CachePanel />}
        </div>
      </div>
    </main>
  );
}
