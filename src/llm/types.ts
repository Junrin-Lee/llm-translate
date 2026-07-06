/** The two API shapes this extension speaks. */
export type Protocol = 'openai' | 'anthropic';

/** A named, user-saved translation service connection. */
export interface ProviderProfile {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  params?: {
    temperature?: number;
    maxTokens?: number;
    /** Per-request timeout; defaults to 60_000ms when unset. */
    timeoutMs?: number;
  };
}

/** A protocol-agnostic chat request assembled from a rendered prompt. */
export interface ChatRequest {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  text: string;
  usage?: TokenUsage;
}

/** Normalized failure categories, uniform across both protocols. */
export type LlmErrorCode =
  | 'auth'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'bad_response';

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  /** Upstream HTTP status, when the failure came from a response. */
  readonly status?: number;
  /** Seconds to wait before retrying, parsed from a Retry-After header. */
  readonly retryAfterSeconds?: number;

  constructor(
    code: LlmErrorCode,
    message: string,
    options?: { status?: number; retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LlmError';
    this.code = code;
    this.status = options?.status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  error?: LlmError;
}

/**
 * Uniform client both adapters implement. `stream` streams deltas via the
 * callback and resolves with the full accumulated result.
 */
export interface TranslationClient {
  stream(
    req: ChatRequest,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult>;
  complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<TestResult>;
}
