import { useEffect } from 'react';
import { BRAND } from '@/brand';
import type { ProviderProfile } from '@/llm/types';
import type { GeneralSettings, ProfileDefaults } from '@/storage/schema';
import { DefaultsPanel } from './DefaultsPanel';
import { GeneralPanel } from './GeneralPanel';
import { ProviderCard } from './ProviderCard';
import { useSettings } from './useSettings';

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

  useEffect(() => {
    document.title = `${BRAND.name} — Settings`;
  }, []);

  if (!settings) {
    return <main className="page page--loading">Loading…</main>;
  }

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

  const { providers, defaults } = settings;

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__title">{BRAND.name}</h1>
        <p className="masthead__tagline">
          Bring your own OpenAI- or Anthropic-compatible API. Keys stay on this device.
        </p>
      </header>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">
            <span className="eyebrow">Providers</span>
          </h2>
          <button type="button" className="btn btn--primary" onClick={addProvider}>
            Add provider
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No providers yet</p>
            <p className="empty__body">
              Add a provider and paste an API key to start translating. Nothing leaves this device
              except requests to the endpoint you configure.
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
        )}
      </section>

      {providers.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">
              <span className="eyebrow">Defaults</span>
            </h2>
          </div>
          <DefaultsPanel providers={providers} defaults={defaults} onChange={setDefaults} />
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">
            <span className="eyebrow">Translation</span>
          </h2>
        </div>
        <GeneralPanel
          general={settings.general}
          disabledSites={settings.siteRules.disableSelection}
          onGeneral={setGeneral}
          onDisabledSites={setDisabledSites}
        />
      </section>
    </main>
  );
}
