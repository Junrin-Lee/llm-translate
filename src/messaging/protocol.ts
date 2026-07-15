import type { ImageAttachment, LlmErrorCode, TokenUsage } from '@/llm/types';
import type { PromptVars } from '@/prompts';

/** Long-lived port name used by content/options to reach the background. */
export const TRANSLATE_PORT = 'llm-translate';

/**
 * Requests the background accepts (first message on a connected port):
 * selection streaming, page batches, screenshot translation, model listing, connection tests.
 */
export type BgRequest =
  | {
      kind: 'translate-stream';
      feature: 'selection';
      promptKind: 'selectionDict' | 'selectionText';
      vars: PromptVars;
      /** Retry sets this to skip a cached result and refetch. */
      bypassCache?: boolean;
    }
  | {
      // payload is an already-encoded batch (orchestrator owns encode/decode).
      kind: 'translate-batch';
      feature: 'page';
      payload: string;
      vars: Omit<PromptVars, 'text'>;
    }
  | {
      kind: 'translate-image';
      feature: 'image';
      /** Cropped & downscaled by the UI before it reaches the background. */
      image: ImageAttachment;
      vars: Omit<PromptVars, 'text'>;
    }
  | { kind: 'list-models'; profileId: string }
  | { kind: 'test-connection'; profileId: string };

/** One-off messages the background / popup send to a tab's content script. */
export type ContentMessage =
  | { type: 'open-selection-panel' }
  | { type: 'translate-page' }
  | { type: 'get-page-status' }
  | {
      /** Start in-place Screenshot Translation over a frozen capture of this tab. */
      type: 'open-image-capture';
      imageDataUrl: string;
    };

/** Reply to a get-page-status query. */
export type PageStatusReply = 'idle' | 'translating' | 'done';

/** Content → background notifications. */
export type TabMessage =
  | { type: 'page-status-changed'; status: PageStatusReply }
  | { type: 'open-options' };

/** Events the background emits back over the port. */
export type BgEvent =
  | { type: 'delta'; text: string }
  | { type: 'batch-result'; text: string }
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
