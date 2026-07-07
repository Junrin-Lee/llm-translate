import { LlmError, type ProviderProfile, type TranslationClient } from '@/llm/types';
import { renderPrompt } from '@/prompts';
import type { AppSettings } from '@/storage/schema';
import type { BgEvent, BgRequest } from './protocol';

export interface HandlerDeps {
  getSettings: () => Promise<AppSettings>;
  resolveProfile: (feature: 'selection' | 'page') => Promise<ProviderProfile | null>;
  createClient: (profile: ProviderProfile) => TranslationClient;
}

function errorEvent(error: unknown): BgEvent {
  if (error instanceof LlmError) return { type: 'error', code: error.code, message: error.message };
  return {
    type: 'error',
    code: 'network',
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Route one background request to the storage/prompt/LLM layers, pushing
 * results out via `emit`. Kept free of Chrome APIs so it is unit-testable;
 * entrypoints/background.ts wires it to a runtime Port.
 */
export async function handleRequest(
  req: BgRequest,
  emit: (event: BgEvent) => void,
  deps: HandlerDeps,
  signal?: AbortSignal,
): Promise<void> {
  try {
    switch (req.kind) {
      case 'translate-stream': {
        const settings = await deps.getSettings();
        const profile = await deps.resolveProfile('selection');
        if (!profile) {
          emit({ type: 'error', code: 'not_found', message: 'No provider configured' });
          return;
        }
        const rendered = renderPrompt(req.promptKind, req.vars, settings.prompts);
        const client = deps.createClient(profile);
        const result = await client.stream(
          { system: rendered.system, user: rendered.user, model: profile.model },
          (text) => emit({ type: 'delta', text }),
          signal,
        );
        emit({ type: 'done', usage: result.usage });
        return;
      }
      case 'translate-batch': {
        const settings = await deps.getSettings();
        const profile = await deps.resolveProfile('page');
        if (!profile) {
          emit({ type: 'error', code: 'not_found', message: 'No provider configured' });
          return;
        }
        const rendered = renderPrompt(
          'pageBatch',
          { ...req.vars, text: req.payload },
          settings.prompts,
        );
        const client = deps.createClient(profile);
        const result = await client.complete(
          { system: rendered.system, user: rendered.user, model: profile.model },
          signal,
        );
        emit({ type: 'batch-result', text: result.text });
        return;
      }
      case 'list-models': {
        const settings = await deps.getSettings();
        const profile = settings.providers.find((p) => p.id === req.profileId);
        if (!profile) {
          emit({ type: 'error', code: 'not_found', message: 'Profile not found' });
          return;
        }
        emit({ type: 'models', models: await deps.createClient(profile).listModels() });
        return;
      }
      case 'test-connection': {
        const settings = await deps.getSettings();
        const profile = settings.providers.find((p) => p.id === req.profileId);
        if (!profile) {
          emit({ type: 'error', code: 'not_found', message: 'Profile not found' });
          return;
        }
        const result = await deps.createClient(profile).testConnection();
        emit({
          type: 'test-result',
          ok: result.ok,
          latencyMs: result.latencyMs,
          errorCode: result.error?.code,
          message: result.error?.message,
        });
        return;
      }
      default: {
        const unknown = req as { kind?: string };
        emit({
          type: 'error',
          code: 'bad_response',
          message: `Unsupported request: ${unknown.kind}`,
        });
      }
    }
  } catch (error) {
    emit(errorEvent(error));
  }
}
