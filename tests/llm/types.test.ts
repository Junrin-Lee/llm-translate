import { describe, expect, it } from 'vitest';
import { LlmError } from '@/llm/types';

describe('LlmError', () => {
  it('is an Error subclass carrying a normalized code', () => {
    const err = new LlmError('rate_limit', 'slow down', {
      status: 429,
      retryAfterSeconds: 3,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe('rate_limit');
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(3);
    expect(err.message).toBe('slow down');
  });

  it('works without optional fields', () => {
    const err = new LlmError('network', 'offline');
    expect(err.code).toBe('network');
    expect(err.status).toBeUndefined();
    expect(err.retryAfterSeconds).toBeUndefined();
  });
});
