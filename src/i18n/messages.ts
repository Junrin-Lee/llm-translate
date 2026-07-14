// English is the source of truth; ZH must define the same keys (enforced by type).
const EN = {
  // Options — navigation / section titles
  navProviders: 'Providers',
  navRouting: 'Routing',
  navTranslation: 'Translation',
  navPrompts: 'Prompts',
  navBackup: 'Backup',
  navCache: 'Cache',
  optionsTagline: 'Bring your own OpenAI- or Anthropic-compatible API. Keys stay on this device.',

  // Providers
  providersAdd: 'Add provider',
  providersEmptyTitle: 'No providers yet',
  providersEmptyBody:
    'Add a provider and paste an API key to start translating. Nothing leaves this device except requests to the endpoint you configure.',
  providersAddFirst: 'Add your first provider',
  confirmDeleteProvider: 'Delete this provider? This cannot be undone.',

  // Provider card
  providerNamePlaceholder: 'Untitled provider',
  providerNameAria: 'Provider name',
  providerUsing: 'Using',
  fieldBaseUrl: 'Base URL',
  fieldApiKey: 'API key',
  apiKeyHint: 'Stored only on this device.',
  fieldModel: 'Model',
  actionShow: 'Show',
  actionHide: 'Hide',
  actionFetchModels: 'Fetch models',
  actionFetching: 'Fetching…',
  modelsAvailable: '{count} models available — pick from the list.',
  modelsNone: 'No models returned. Enter the model name manually.',
  advanced: 'Advanced',
  fieldTemperature: 'Temperature',
  fieldMaxTokens: 'Max tokens',
  placeholderDefault: 'default',
  actionTestConnection: 'Test connection',
  statusTesting: 'Testing…',
  statusConnected: 'Connected',
  actionDelete: 'Delete',

  // Routing
  routingGlobalDefault: 'Global default',
  routingGlobalHint: 'Used by any feature without its own override.',
  routingNone: '— none —',
  routingSelection: 'Selection translation',
  routingPage: 'Page translation',
  routingUseGlobal: 'Use global default',

  // Translation (general settings)
  targetLanguage: 'Target language',
  genUiLang: 'Interface language',
  uiLangAuto: 'Automatic',
  genTrigger: 'Selection trigger',
  triggerIconLabel: 'Show an icon',
  triggerIconHint: 'Select text, then click the icon to translate.',
  triggerInstantLabel: 'Translate instantly',
  triggerInstantHint: 'Translate as soon as you select text — uses more tokens.',
  triggerShortcutLabel: 'Shortcut only',
  triggerShortcutHint: 'No icon; press the translate-selection shortcut instead.',
  genDisableSites: 'Disable the selection icon on these sites',
  actionAdd: 'Add',
  actionRemove: 'Remove',

  // Prompts
  promptDictLabel: 'Dictionary lookup',
  promptDictHint: 'Selection popup, for single words or short phrases (JSON dictionary output).',
  promptTextLabel: 'Selection translation',
  promptTextHint: 'Selection popup, for sentences and longer text.',
  promptBatchLabel: 'Full-page translation',
  promptBatchHint: 'Batched page segments — the prompt must keep every @@n@@ marker.',
  promptCustom: 'Custom',
  promptVars: 'Variables: {{text}}, {{targetLang}}',
  promptReset: 'Reset to default',

  // Backup
  backupExport: 'Export',
  backupExportHint: 'Download your settings as a JSON file.',
  backupIncludeKeys: 'Include API keys',
  backupIncludeKeysHint: 'Off by default — the file would hold your keys in plain text.',
  backupExportBtn: 'Export settings',
  backupImport: 'Import',
  backupImportHint: 'Replace all settings from an exported file.',
  backupImportBtn: 'Import settings…',
  backupImportFailed: 'Import failed',

  // Cache
  cacheLabel: 'Translation cache',
  cacheStats: 'Selection: {selection} entries · Page: {page} entries',
  cacheClear: 'Clear cache',

  // Popup
  popupHintDefault: 'Translate the whole page, or select text on any page for a quick translation.',
  popupHintTranslated:
    'This page is translated. Restore the original below, or select text for a quick translation.',
  popupAutoSite: 'Always translate',
  openSettings: 'Open settings',

  // Selection panel
  panelDictionary: 'Dictionary',
  panelTranslation: 'Translation',
  panelClose: 'Close',
  panelLookingUp: 'Looking up…',
  panelTranslating: 'Translating…',
  panelRetry: 'Retry',
  panelCopy: 'Copy',
  iconTranslateSelection: 'Translate selection',

  // Page toolbar
  toolbarTranslating: 'Translating',
  toolbarTranslated: 'Translated',
  toolbarCancel: 'Cancel',
  toolbarBilingual: 'Bilingual',
  toolbarOnly: 'Only',
  toolbarDrag: 'Drag to move',
  toolbarModeTitle: 'Switch between bilingual and translation-only',
  toolbarRetryFailed: 'Retry {count} failed',
  pageRetryHint: 'Click to retry',

  // Shared (popup buttons, context menu, commands)
  translatePage: 'Translate this page',
  translateSelection: 'Translate selection',
  restoreOriginal: 'Restore original',

  // Image Translation
  imageCaptureHint: 'Drag to select the area to translate · Esc to cancel',
  imagePrivacyNotice: 'The selected area is sent only to the API endpoint you configured.',
  imagePrivacyGotIt: 'Got it',
  imageTranslate: 'Image translation',
  imageNoVisionHint:
    'If this keeps failing, the model may not accept images — set a vision-capable model for Image Translation in Routing.',
  imageOpenSettings: 'Open settings',

  // Permission onboarding (Firefox treats site access as optional — ADR-0005)
  permBannerText: 'Site access is off — translation cannot run on any page.',
  permBannerAction: 'Grant access',
  onboardingTitle: 'One step before you translate',
  onboardingWhy:
    'LLM Translate reads the text of the page you are viewing to translate it, and talks only to the LLM endpoint you configure. Firefox asks you to grant this site access explicitly.',
  onboardingGrant: 'Grant site access',
  onboardingGranted: 'All set! You can close this page.',
  onboardingNext: 'Next: add your LLM provider in Settings.',
  onboardingOpenSettings: 'Open Settings',
  onboardingManual:
    'Firefox dismissed the request. You can also enable it under about:addons → LLM Translate → Permissions.',
} as const;

export type MessageKey = keyof typeof EN;

const ZH: Record<MessageKey, string> = {
  navProviders: '服务商',
  navRouting: '路由',
  navTranslation: '翻译',
  navPrompts: '提示词',
  navBackup: '备份',
  navCache: '缓存',
  optionsTagline: '自带 OpenAI 兼容或 Anthropic 兼容 API,密钥只保存在本机。',

  providersAdd: '添加服务商',
  providersEmptyTitle: '还没有服务商',
  providersEmptyBody:
    '添加一个服务商并填入 API Key 即可开始翻译。除了发往你配置的接口,数据不会离开本机。',
  providersAddFirst: '添加第一个服务商',
  confirmDeleteProvider: '删除这个服务商?此操作不可撤销。',

  providerNamePlaceholder: '未命名服务商',
  providerNameAria: '服务商名称',
  providerUsing: '使用中',
  fieldBaseUrl: 'Base URL',
  fieldApiKey: 'API Key',
  apiKeyHint: '只保存在本机。',
  fieldModel: '模型',
  actionShow: '显示',
  actionHide: '隐藏',
  actionFetchModels: '获取模型',
  actionFetching: '获取中…',
  modelsAvailable: '有 {count} 个模型可选——从列表中选择。',
  modelsNone: '未返回模型,请手动填写模型名。',
  advanced: '高级',
  fieldTemperature: 'Temperature',
  fieldMaxTokens: 'Max tokens',
  placeholderDefault: '默认',
  actionTestConnection: '测试连接',
  statusTesting: '测试中…',
  statusConnected: '已连接',
  actionDelete: '删除',

  routingGlobalDefault: '全局默认',
  routingGlobalHint: '所有未单独指定的功能都用它。',
  routingNone: '— 无 —',
  routingSelection: '划词翻译',
  routingPage: '全文翻译',
  routingUseGlobal: '使用全局默认',

  targetLanguage: '目标语言',
  genUiLang: '界面语言',
  uiLangAuto: '自动',
  genTrigger: '划词触发方式',
  triggerIconLabel: '显示图标',
  triggerIconHint: '选中文字后点图标翻译。',
  triggerInstantLabel: '选中即翻',
  triggerInstantHint: '选中文字立即翻译——更费 token。',
  triggerShortcutLabel: '仅快捷键',
  triggerShortcutHint: '不显示图标,改用划词快捷键触发。',
  genDisableSites: '在这些站点禁用划词图标',
  actionAdd: '添加',
  actionRemove: '移除',

  promptDictLabel: '词典查询',
  promptDictHint: '划词浮层,用于单词或短语(词典式 JSON 输出)。',
  promptTextLabel: '划词翻译',
  promptTextHint: '划词浮层,用于句子和长文本。',
  promptBatchLabel: '全文翻译',
  promptBatchHint: '整页分批翻译——提示词必须保留每个 @@n@@ 标记。',
  promptCustom: '自定义',
  promptVars: '变量:{{text}}、{{targetLang}}',
  promptReset: '恢复默认',

  backupExport: '导出',
  backupExportHint: '把设置导出为 JSON 文件。',
  backupIncludeKeys: '包含 API Key',
  backupIncludeKeysHint: '默认关闭——导出文件会明文包含你的密钥。',
  backupExportBtn: '导出设置',
  backupImport: '导入',
  backupImportHint: '从导出的文件替换全部设置。',
  backupImportBtn: '导入设置…',
  backupImportFailed: '导入失败',

  cacheLabel: '翻译缓存',
  cacheStats: '划词:{selection} 条 · 全文:{page} 条',
  cacheClear: '清空缓存',

  popupHintDefault: '翻译整页,或在任意页面选中文字快速翻译。',
  popupHintTranslated: '本页已翻译。可在下方还原原文,或选中文字快速翻译。',
  popupAutoSite: '始终翻译',
  openSettings: '打开设置',

  panelDictionary: '词典',
  panelTranslation: '翻译',
  panelClose: '关闭',
  panelLookingUp: '查询中…',
  panelTranslating: '翻译中…',
  panelRetry: '重试',
  panelCopy: '复制',
  iconTranslateSelection: '翻译所选',

  toolbarTranslating: '翻译中',
  toolbarTranslated: '已翻译',
  toolbarCancel: '取消',
  toolbarBilingual: '双语',
  toolbarOnly: '仅译文',
  toolbarDrag: '拖动移动',
  toolbarModeTitle: '在双语和仅译文之间切换',
  toolbarRetryFailed: '重试 {count} 项失败',
  pageRetryHint: '点击重试',

  translatePage: '翻译此页',
  translateSelection: '翻译所选',
  restoreOriginal: '还原原文',

  // 图片翻译
  imageCaptureHint: '拖拽框选要翻译的区域 · Esc 取消',
  imagePrivacyNotice: '框选区域仅会发送至你配置的 API 端点。',
  imagePrivacyGotIt: '知道了',
  imageTranslate: '图片翻译',
  imageNoVisionHint:
    '若持续失败,可能是当前模型不支持图片输入 —— 请在「路由」中为图片翻译指定支持视觉的模型。',
  imageOpenSettings: '打开设置',

  // Permission onboarding(Firefox 将站点访问视为可选权限 — ADR-0005)
  permBannerText: '站点访问权限未开启——翻译功能无法在任何页面工作。',
  permBannerAction: '立即授权',
  onboardingTitle: '开始翻译前,还差一步',
  onboardingWhy:
    'LLM Translate 需要读取你正在浏览的页面文本来完成翻译,并且只与你自己配置的 LLM 接口通信。Firefox 要求你显式授予这项站点访问权限。',
  onboardingGrant: '授予站点访问权限',
  onboardingGranted: '搞定!可以关闭此页了。',
  onboardingNext: '下一步:在设置中添加你的 LLM Provider。',
  onboardingOpenSettings: '打开设置',
  onboardingManual:
    'Firefox 未完成授权。你也可以在 about:addons → LLM Translate → 权限 中手动开启。',
};

export const MESSAGES = { en: EN, zh: ZH } as const;
