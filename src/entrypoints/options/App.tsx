import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import type { ProviderProfile } from '@/llm/types';
import type { GeneralSettings, ProfileDefaults, PromptOverrides } from '@/storage/schema';
import { BackupPanel } from './BackupPanel';
import { CachePanel } from './CachePanel';
import { DefaultsPanel } from './DefaultsPanel';
import { GeneralPanel } from './GeneralPanel';
import { PromptsPanel } from './PromptsPanel';
import { ProviderCard } from './ProviderCard';
import { useSettings } from './useSettings';

const SECTIONS = [
  { id: 'providers', label: 'Providers' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'translation', label: 'Translation' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'backup', label: 'Backup' },
  { id: 'cache', label: 'Cache' },
] as const;

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

  useEffect(() => {
    document.title = `${BRAND.name} — Settings`;
  }, []);

  useEffect(() => {
    const onHashChange = () => setActive(sectionFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!settings) {
    return <main className="page page--loading">Loading…</main>;
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
    if (!confirm('Delete this provider? This cannot be undone.')) return;
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
  const activeLabel = SECTIONS.find((s) => s.id === active)?.label ?? '';

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__title">{BRAND.name}</h1>
        <p className="masthead__tagline">
          Bring your own OpenAI- or Anthropic-compatible API. Keys stay on this device.
        </p>
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
              {s.label}
            </button>
          ))}
        </nav>

        <div className="content">
          <div className="content__head">
            <h2 className="content__title">{activeLabel}</h2>
            {active === 'providers' && (
              <button type="button" className="btn btn--primary" onClick={addProvider}>
                Add provider
              </button>
            )}
          </div>

          {active === 'providers' &&
            (providers.length === 0 ? (
              <div className="empty">
                <p className="empty__title">No providers yet</p>
                <p className="empty__body">
                  Add a provider and paste an API key to start translating. Nothing leaves this
                  device except requests to the endpoint you configure.
                </p>
                <button type="button" className="btn btn--primary" onClick={addProvider}>
                  Add your first provider
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

          {active === 'defaults' && (
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
