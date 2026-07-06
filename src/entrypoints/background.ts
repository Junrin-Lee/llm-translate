export default defineBackground(() => {
  // Message routing and the single LLM request exit live here (wired in T1.9).
  console.debug('[llm-translate] background service worker ready');
});
