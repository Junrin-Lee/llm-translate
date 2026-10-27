# 0006 — 隐私审计:页面脚本能读到扩展界面和截屏画面,隐私政策落后于功能

[English](./0006-privacy-audit.md) · **简体中文**

- **发现于:** 2026-10-27,v0.6.0 发布后做的一次全仓隐私审计
- **状态:** 已修复(第 1 项的 iframe 彻底隔离留作后续)
- **核实方式:** 读源码;用 Playwright 在页面主世界里执行脚本,修复前能拿到扩展的 shadow root,修复后拿不到

## 现象

这次审计找到 5 个问题,按严重程度排序:

| # | 级别 | 问题 |
|---|------|------|
| 1 | 中 | 截屏翻译时,整张标签页截图以 data URL 形式放进宿主页面的 DOM,页面脚本能读到,其中也包括跨域 iframe 里的内容 |
| 2 | 中 | 隐私政策(最后更新 2026-07-14)没有覆盖文本翻译和划词搜索,"只发送你选择翻译的文字"这一说法也不完全准确 |
| 3 | 低 | 页面内的所有扩展界面(划词面板、搜索结果、全文翻译工具条)都挂在 open shadow root 里,页面脚本和录屏类 SDK 能读到 |
| 4 | 低 | Base URL 允许填非本机的 `http://` 地址,API Key 和文本会明文传输,界面没有任何提示 |
| 5 | 低 | 全文翻译缓存写在 `storage.local` 里,没有过期时间,私密页面的译文会一直留在磁盘上,直到被挤出 1000 条上限或用户手动清空 |

## 根因

**1 和 3 是同一个根因。** `src/entrypoints/content.tsx:20` 调用 `createShadowRootUi` 时没有传 `mode`,WXT 默认用 `"open"`(`node_modules/wxt/dist/utils/content-script-ui/shadow-root.mjs:29`)。open shadow root 可以通过 `element.shadowRoot` 从页面主世界访问。

截屏的流程是:`src/capture/launch.ts:12` 用 `tabs.captureVisibleTab` 截下整个可见标签页,然后通过消息把 data URL 交给这个页面的 content script(`src/ui/image/ImageCaptureApp.tsx:25`),再由 `src/ui/image/CropOverlay.tsx:64` 渲染成 `<img src={dataUrl}>`。`captureVisibleTab` 截的是合成后的像素,会把跨域 iframe(支付表单、第三方登录框、嵌入的其他站点)一起截进去。这些内容原本受同源策略保护,页面读不到;放进 open shadow root 之后,页面脚本就能读到。

**2** 是文档没有跟着功能更新。v0.5.0 加了文本翻译,v0.6.0 加了划词搜索,政策都没改。

**4** 的原因是 `normalizeBaseUrl`(`src/llm/base-url.ts`)和 `ProviderCard` 都不检查协议。

**5** 是有意的设计(`src/entrypoints/background.ts:22-31`),但没有过期策略。

## 证据链

1. 在 Playwright 里,于页面主世界执行 `!!document.querySelector('llm-translate-ui')?.shadowRoot`,返回 `true`。任何站点脚本都能做同样的事。
2. 截屏遮罩显示期间,站点只要在这个 shadow root 上挂一个 `MutationObserver`,就能拿到 `img.src`,也就是整张截图。data URL 不受跨域污染,可以直接画到 canvas 上再上传。
3. 隐私政策写着"The only outbound network requests ... only carry the text you chose to translate"。但下面几种情况和这句话对不上:
   - 自动翻译站点会在用户没有手动操作时发送整页文本,SPA 换页后也会继续翻译。
   - 文本翻译在粘贴后立即发送,停止输入 2 秒后自动发送。
   - 划词搜索的内置 prompt 让模型"Search the web",支持联网的服务商会把选中文字转发给自己的搜索后端,也就是第三方。
   - 搜索结果里的链接点开后会访问第三方网站。
4. 划词面板、搜索结果和错误信息都渲染在同一个 open shadow root 里,原理同第 1 条。

## 修复方案

| # | 方案 | 代价 |
|---|------|------|
| 1 | 首选:截屏的选区和裁剪改到扩展自己源的 iframe 里做(web_accessible 页面),data URL 不进宿主页面 DOM。退一步的方案是只把 shadow root 改成 `closed` | iframe 方案要改截屏遮罩的结构;`closed` 只改一行,能挡住页面通过 `shadowRoot` 读取,但截图仍然是宿主页面 DOM 里的节点,隔离不如 iframe 彻底 |
| 2 | 更新中英文隐私政策:补上文本翻译、划词搜索(服务商可能联网搜索)、自动翻译站点的发送时机、页面缓存的保存时长;同时检查 `store-assets/` 下的商店隐私声明 | 只改文档 |
| 3 | `createShadowRootUi` 传 `mode: 'closed'` | Playwright 的定位器无法穿透 closed shadow root,现有 e2e 要改成通过测试专用的开关或扩展页面来断言 |
| 4 | Base URL 是非本机的 `http://` 时,在 ProviderCard 上显示警告(不强制禁止,本地网关需要 http) | 一条提示文案和一个判断 |
| 5 | 页面缓存加 TTL(比如 7 天),或者在设置里提供"只缓存到浏览器关闭"的选项 | 缓存条目要多存一个时间判断;数据结构里已有 `t` 字段 |

## 修复

| # | 改动 |
|---|------|
| 1、3 | `src/entrypoints/content.tsx`:`createShadowRootUi` 传 `mode: 'closed'`。测试构建(`--mode e2e`)保持 `open`,因为 Playwright 和 Selenium 只能进入 open root;`e2e`、`e2e:ui`、`e2e:firefox`、`screenshots` 四个脚本改用 `--mode e2e`,产物在 `.output/chrome-mv3-e2e`,不会覆盖平时加载的 `.output/chrome-mv3` |
| 1、3 | `src/ui/selection/TranslatePanel.tsx`:点击外部关闭改为按坐标判断。closed root 下,`document` 上的监听器拿到的 `composedPath()` 止于宿主元素,原来的写法会让面板内的任何点击都把面板关掉 |
| 2 | 中英文隐私政策新增「何时发送文本」和「网页上的扩展界面」两节,补充文本翻译、划词搜索、自动翻译站点的发送时机、缓存 7 天和明文 http 警告;`store-assets/justifications.md` 的 Single purpose 和数据声明加上划词搜索 |
| 4 | `src/llm/base-url.ts` 新增 `isCleartextRemote()`,`ProviderCard` 在 Base URL 下方显示警告;本机地址(localhost、`*.localhost`、127.x、`[::1]`)不提示 |
| 5 | `src/translator/cache.ts` 新增 `ttlMs`:过期条目不再命中,并在下次写入时删除;全文翻译缓存设为 7 天 |

## 验证

- 单元测试新增 7 个(缓存 TTL 3 个、明文 http 判断 4 个),先红后绿;全量 286 个通过。
- e2e(`--mode e2e` 构建)15 个全部通过;typecheck 通过;`verify:firefox` 通过。
- 用生产构建实测:页面主世界里 `document.querySelector('llm-translate-ui').shadowRoot` 为 `null`;打开搜索面板后点「翻译」tab,面板不关并正常切换;点面板外部,面板关闭。

## 核实没有问题的地方

- 没有遥测,除了用户配置的端点没有其他外发请求(全仓没有其他 `fetch` / `sendBeacon` / WebSocket)。
- 导出设置默认去掉 API Key;日志和错误信息里没有 Key,错误详情只截取服务商返回的前 300 个字符。
- 划词会跳过 input、textarea 和 contenteditable;全文翻译跳过 textarea、contenteditable、code、pre 和隐藏元素。
- 搜索结果里的链接只放行 http/https,带 `rel="noopener noreferrer"`,不会泄露来源页。
- 没有 `externally_connectable`,网页无法直接给后台发消息。
- 仓库里没有提交任何密钥;Firefox 签名脚本通过环境变量传 AMO 凭据,不放在命令行参数里,也不打印。

## 有意留白

- 第 1 项的彻底方案(截屏框选放进扩展源 iframe)没做。closed root 已经挡住通过 `shadowRoot` 的读取,iframe 方案留作后续。
- 生产构建的 closed 模式没有自动化测试覆盖,因为 e2e 只能跑 open 构建。这次靠手动探针验证。

- 全文翻译会把译文写进页面的普通 DOM,这是功能本身决定的:页面脚本和录屏 SDK 能看到译文,无法避免。原文本来就在页面上,额外泄露的只是"用户用了翻译"和目标语言。
- 文本翻译粘贴即发送是用户刚确认的交互,误粘贴密码也会立即发出。这点只在隐私政策里说明,不改行为。
