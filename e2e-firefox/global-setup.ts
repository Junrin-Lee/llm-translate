import { type ChildProcess, spawn } from 'node:child_process';

const PORT = Number(process.env.MOCK_PORT ?? 8787);

/** Boot e2e/mock-llm.mjs once for the whole suite; kill it on teardown. */
export default async function setup(): Promise<() => void> {
  const proc: ChildProcess = spawn('node', ['e2e/mock-llm.mjs'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${PORT}/fixtures/article.html`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return () => {
    proc.kill();
  };
}
