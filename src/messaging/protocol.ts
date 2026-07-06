import type { LlmErrorCode, TokenUsage } from '@/llm/types';
import type { PromptVars } from '@/prompts';

/** Long-lived port name used by content/options to reach the background. */
export const TRANSLATE_PORT = 'llm-translate';

/**
 * Requests the background accepts (first message on a connected port).
 * `translate-batch` (page translation) is added in M3 with the orchestrator.
 */
export type BgRequest =
  | {
      kind: 'translate-stream';
      feature: 'selection';
      promptKind: 'selectionDict' | 'selectionText';
      vars: PromptVars;
    }
  | { kind: 'list-models'; profileId: string }
  | { kind: 'test-connection'; profileId: string };

/** Events the background emits back over the port. */
export type BgEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'models'; models: string[] }
  | {
      type: 'test-result';
      ok: boolean;
      latencyMs?: number;
      errorCode?: LlmErrorCode;
      message?: string;
    }
  | { type: 'error'; code: LlmErrorCode; message: string };
