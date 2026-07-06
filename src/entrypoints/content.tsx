export default defineContentScript({
  // Selection listener + full-page DOM engine + Shadow DOM UI are added in M2/M3.
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.debug('[llm-translate] content script loaded');
  },
});
