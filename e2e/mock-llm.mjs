import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// A tiny stand-in for an LLM provider: speaks both the OpenAI and Anthropic
// wire formats (streaming + non-streaming), lists models, and serves the test
// fixtures — so E2E runs fully offline and deterministically.

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_PORT ?? 8787);
const SENTINEL = '[[MT]]';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': '*',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
  });
}

/**
 * If the prompt is an @@n@@-encoded page batch, echo every marker back with a
 * translated body so the extension's decodeBatch maps it 1:1. Null otherwise.
 */
function translateBatch(text) {
  const marker = /@@(\d+)@@/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return null;
  const parts = matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    return `@@${m[1]}@@\n${SENTINEL} ${body}`;
  });
  return parts.join('\n\n');
}

/** Deterministic "translation" for a given system + user prompt. */
function responseText(system, user) {
  const batch = translateBatch(user);
  if (batch) return batch;
  if (/dictionary|JSON object/i.test(system)) {
    return JSON.stringify({
      word: user.trim().slice(0, 40),
      phonetic: '/mɒk/',
      senses: [{ pos: 'n.', meaning: `${SENTINEL} 释义` }],
      examples: [`${SENTINEL} example sentence`],
    });
  }
  return `${SENTINEL} ${user.trim()}`;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}

/** OpenAI-style SSE: split the text into two delta frames, then [DONE]. */
function streamOpenAi(res, text) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...CORS });
  const mid = Math.ceil(text.length / 2);
  for (const content of [text.slice(0, mid), text.slice(mid)]) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

/** Anthropic-style SSE: text_delta blocks, then message_stop. */
function streamAnthropic(res, text) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...CORS });
  const mid = Math.ceil(text.length / 2);
  for (const chunk of [text.slice(0, mid), text.slice(mid)]) {
    const frame = { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } };
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
  res.end();
}

function serveFixture(res, pathname) {
  const name = normalize(pathname.replace(/^\/fixtures\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
  try {
    const html = readFileSync(join(DIR, 'fixtures', name));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...CORS });
    res.end(html);
  } catch {
    res.writeHead(404, CORS);
    res.end('not found');
  }
}

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (pathname === '/health') {
    res.writeHead(200, CORS);
    res.end('ok');
    return;
  }
  if (method === 'GET' && pathname.startsWith('/fixtures/')) {
    serveFixture(res, pathname);
    return;
  }
  if (method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) {
    sendJson(res, 200, { data: [{ id: 'mock-model' }, { id: 'mock-model-pro' }] });
    return;
  }
  if (method === 'POST' && pathname.endsWith('/chat/completions')) {
    const body = JSON.parse((await readBody(req)) || '{}');
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const pick = (role) =>
      messages
        .filter((m) => m.role === role)
        .map((m) => m.content)
        .join('\n');
    const text = responseText(pick('system'), pick('user'));
    if (body.stream) streamOpenAi(res, text);
    else
      sendJson(res, 200, {
        choices: [{ message: { role: 'assistant', content: text } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    return;
  }
  if (method === 'POST' && pathname.endsWith('/messages')) {
    const body = JSON.parse((await readBody(req)) || '{}');
    const system = typeof body.system === 'string' ? body.system : '';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const user = messages
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    const text = responseText(system, user);
    if (body.stream) streamAnthropic(res, text);
    else
      sendJson(res, 200, {
        content: [{ type: 'text', text }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    return;
  }

  res.writeHead(404, CORS);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`[mock-llm] listening on http://localhost:${PORT}`);
});
