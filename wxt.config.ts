import { defineConfig } from 'wxt';
import { BRAND } from './src/brand';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: BRAND.name,
    description:
      'Selection & full-page translation powered by your own OpenAI-compatible or Anthropic-compatible LLM API.',
    // Permissions, host_permissions and commands are declared in T0.4.
  },
});
