import { useEffect, useState } from 'react';
import { BRAND } from '@/brand';
import { setUiLanguage } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import type { LlmProvider, ModelProfile } from '@/llm/types';
import {
  countMergeableProviders,
  type GeneralSettings,
  mergeDuplicateProviders,
  type ProfileDefaults,
  type PromptOverrides,
  pruneDefaults,
} from '@/storage/schema';
import { PermissionBanner } from '@/ui/PermissionBanner';
import { BackupPanel } from './BackupPanel';
import { CachePanel } from './CachePanel';
import { DefaultsPanel } from './DefaultsPanel';
import { GeneralPanel } from './GeneralPanel';
import { MergeProvidersBanner } from './MergeProvidersBanner';
import { ModelCard } from './ModelCard';
import { PromptsPanel } from './PromptsPanel';
import { ProviderCard } from './ProviderCard';
import { useSettings } from './useSettings';

const SECTIONS = [
  { id: 'providers', key: 'navProviders' },
  { id: 'models', key: 'navModels' },
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

function newProvider(): LlmProvider {
  return { id: crypto.randomUUID(), name: '', protocol: 'openai', baseUrl: '', apiKey: '' };
}

function newModel(providerId: string): ModelProfile {
  return { id: crypto.randomUUID(), name: '', providerId, model: '' };
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

  const addProvider = () => mutate((s) => ({ ...s, providers: [...s.providers, newProvider()] }));

  const patchProvider = (id: string, patch: Partial<LlmProvider>) =>
    mutate((s) => ({
      ...s,
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const deleteProvider = (id: string) => {
    if (!confirm(t('confirmDeleteProvider'))) return;
    // The button is disabled while models still reference it, so this only ever
    // removes an unused connection and cannot orphan anything.
    mutate((s) => ({ ...s, providers: s.providers.filter((p) => p.id !== id) }));
  };

  const mergeProviders = () => mutate(mergeDuplicateProviders);

  const addModel = () =>
    mutate((s) => {
      const providerId = s.providers[0]?.id;
      if (!providerId) return s;
      const profile = newModel(providerId);
      return {
        ...s,
        models: [...s.models, profile],
        // The first model ever created becomes the global default, matching the
        // old behaviour where the first provider did.
        defaults: s.models.length === 0 ? { ...s.defaults, global: profile.id } : s.defaults,
      };
    });

  const patchModel = (id: string, patch: Partial<ModelProfile>) =>
    mutate((s) => ({
      ...s,
      models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));

  const deleteModel = (id: string) => {
    if (!confirm(t('confirmDeleteModel'))) return;
    mutate((s) => {
      const models = s.models.filter((m) => m.id !== id);
      const pruned = pruneDefaults(s.defaults, models);
      return {
        ...s,
        models,
        defaults: { ...pruned, global: pruned.global ?? models[0]?.id ?? null },
      };
    });
  };

  const setDefaults = (defaults: ProfileDefaults) => mutate((s) => ({ ...s, defaults }));

  const setGeneral = (patch: Partial<GeneralSettings>) =>
    mutate((s) => ({ ...s, general: { ...s.general, ...patch } }));

  const setDisabledSites = (sites: string[]) =>
    mutate((s) => ({ ...s, siteRules: { ...s.siteRules, disableSelection: sites } }));

  const setPrompts = (prompts: PromptOverrides) => mutate((s) => ({ ...s, prompts }));

  const { providers, models, defaults } = settings;
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
            {active === 'models' && providers.length > 0 && (
              <button type="button" className="btn btn--primary" onClick={addModel}>
                {t('modelsAdd')}
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
              <>
                <MergeProvidersBanner
                  count={countMergeableProviders(providers)}
                  onMerge={mergeProviders}
                />
                <div className="cards">
                  {providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      inUseCount={models.filter((m) => m.providerId === provider.id).length}
                      onPatch={(patch) => patchProvider(provider.id, patch)}
                      onDelete={() => deleteProvider(provider.id)}
                    />
                  ))}
                </div>
              </>
            ))}

          {active === 'models' &&
            (providers.length === 0 ? (
              <div className="empty">
                <p className="empty__title">{t('modelsNeedProviderTitle')}</p>
                <p className="empty__body">{t('modelsNeedProviderBody')}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate('providers')}
                >
                  {t('providersAddFirst')}
                </button>
              </div>
            ) : models.length === 0 ? (
              <div className="empty">
                <p className="empty__title">{t('modelsEmptyTitle')}</p>
                <p className="empty__body">{t('modelsEmptyBody')}</p>
                <button type="button" className="btn btn--primary" onClick={addModel}>
                  {t('modelsAddFirst')}
                </button>
              </div>
            ) : (
              <div className="cards">
                {models.map((profile) => (
                  <ModelCard
                    key={profile.id}
                    profile={profile}
                    providers={providers}
                    isGlobalDefault={defaults.global === profile.id}
                    onPatch={(patch) => patchModel(profile.id, patch)}
                    onDelete={() => deleteModel(profile.id)}
                  />
                ))}
              </div>
            ))}

          {active === 'routing' && (
            <DefaultsPanel models={models} defaults={defaults} onChange={setDefaults} />
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
