# Content script 常驻 `<all_urls>`,不用 activeTab / optional permissions

划词翻译要求"任意页面选中文本即出现触发图标",全文翻译的自动翻译站点要求页面加载时即可介入,两者都需要 content script 在所有 http/https 页面常驻,因此 manifest 直接声明 `<all_urls>`(含 `host_permissions`,background 还需向用户自定义的任意 API Base URL 发请求)。代价是安装时的"读取并更改所有网站数据"告知与更严格的商店审核——这是翻译类扩展(沉浸式翻译、Trancy)的行业惯例,通过权限用途说明与隐私政策应对。

## Considered Options

- **activeTab**:审核最友好,但点击扩展图标前脚本不存在,"选中即出图标"与自动翻译站点均无法实现,与已定功能冲突,否决。
- **optional_host_permissions + onboarding 授权**:安装时零告知,但"未授权态"会渗透进所有功能路径,复杂度显著增加,收益仅是把同一条告知从安装时挪到首次使用时,否决。
