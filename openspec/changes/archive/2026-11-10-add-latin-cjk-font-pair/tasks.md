# Tasks

## 1. 字体模型与组合

- [x] 1.1 在 `js/model.js` 中新增 `DEFAULT_LATIN_FONT` 和 `DEFAULT_CJK_FONT`，并把 `DEFAULT_FONT` 改为西文在前、中文在后、末尾 `sans-serif`；验证：浏览器控制台读取 `Listify.model.DEFAULT_FONT`，顺序为西文默认栈在中文默认栈之前，且只有一个 `sans-serif`
- [x] 1.2 在 `js/model.js` 中统一 `quoteFamily` 与 `composeFontFamily(pair)`，处理未选槽位用默认栈、同族去重、末尾只追加一次 `sans-serif`；验证：控制台分别传入 `{latin:'Inter',cjk:'Noto Sans SC'}`、`{latin:'Inter'}`、`{cjk:'Noto Sans SC'}`、`{}`，输出符合设计示例且无重复 generic family
- [x] 1.3 在 `js/model.js` 中新增 `normalizeStyle(style)` 和 `applyFontPair(style, pair)`：有效 pair 重新组合 `fontFamily`，无效 pair 丢弃并保留 `fontFamily`，无 pair 时补默认值；验证：控制台构造三种样式对象，调用后检查字段
- [x] 1.4 确认 `fontString(style)` 继续使用 `style.fontFamily`，不新增分支；验证：修改一个样式的 `fontFamily` 后，`layout.measureText` 和 `render` 的 `ctx.font` 使用新值（同一字符串的测量宽度发生变化）

## 2. 持久化与兼容

- [x] 2.1 修改 `js/io.js` 的 `serializeStyle`，在有效时保存可选 `fontPair`（`latin`/`cjk`），并继续保存 `fontFamily`；验证：选择双槽位后导出项目 JSON，包含两项且 `fontFamily` 为组合栈
- [x] 2.2 在加载路径对分类 `titleStyle`、`songStyle` 和文字 `style` 调用 `model.normalizeStyle`；验证：加载带 `fontPair` 的项目后 `fontFamily` 与 pair 一致；加载没有 `fontPair` 的旧项目时 `fontFamily` 原样保留
- [x] 2.3 处理畸形 `fontPair`（非对象、槽位非字符串、空对象）：加载时丢弃该字段并用已保存的 `fontFamily` 渲染；验证：手工修改 JSON 注入畸形值后导入，页面不崩溃且字体仍按 `fontFamily` 显示
- [x] 2.4 验证旧版本兼容：导出的项目同时含 `fontFamily` 和 `fontPair`，移除 `fontPair` 后仍能按 `fontFamily` 正常加载；验证：复制 JSON 删除 `fontPair` 再导入，画布字体不变

## 3. 属性面板与选择器

- [x] 3.1 修改 `js/ui.js` 的 `fontField`/`bindFontField`：保留完整字体栈输入框，增加“选西文字体”“选中文字体”两个按钮、槽位提示和“使用同一字体”入口；验证：分类名、歌名、自由文字三处属性面板都出现两个按钮和提示
- [x] 3.2 手动编辑完整字体栈时更新 `style.fontFamily`、删除 `style.fontPair` 并触发重绘；验证：输入自定义栈后画布立即使用新栈，保存的 JSON 无 `fontPair`
- [x] 3.3 扩展 `js/fontpicker.js` 的 `open` 选项：接收 `slot`，设置标题、槽位示例（西文 `Playlist 123 ABC`，中文 `歌单 中文歌曲`）、当前选中高亮，并让“系统默认”回传 `null`；验证：两个槽位分别打开，标题/预览/高亮/默认项行为符合要求
- [x] 3.4 绑定选择结果：按 `slot` 写入 `style.fontPair`，调用 `applyFontPair` 重新组合 `fontFamily`，同步输入框并重绘；验证：先选西文再选中文、只选一个槽位、两个槽位相同族三种情况，输入框和画布都正确
- [x] 3.5 处理“系统默认”和“使用同一字体”：系统默认只清除当前槽位，使用同一字体清空 `fontPair` 并保留当前栈；验证：西文已选、中文选默认后西文不变；使用同一字体后双槽位提示变为“默认/自定义”且画布不变
- [x] 3.6 在 `style.css` 中为新控件补布局，保证属性面板窄宽度下不溢出；验证：缩窄窗口或属性面板，按钮和提示换行但不遮挡输入框
- [x] 3.7 不支持 Local Font Access 时两个按钮禁用、输入框和提示可用；验证：在 DevTools 中临时删除 `window.queryLocalFonts` 与 `navigator.queryLocalFonts` 后刷新，按钮不可用，手动输入仍能改字体

## 4. 默认值与迁移

- [x] 4.1 新建分类块和自由文字使用新的西文在前默认字体；验证：新建项目后读取元素 `style.fontFamily`，顺序为西文默认在前、中文默认在后
- [x] 4.2 加载旧项目不自动替换 `fontFamily`；验证：导入一个保存过旧默认栈的项目，字段不变，画布仍按旧栈渲染
- [x] 4.3 两个槽位都选择“系统默认”时恢复为新的默认组合栈；验证：清空双槽位后输入框等于 `Listify.model.DEFAULT_FONT`
- [x] 4.4 选择器槽位预览不会把回退字体误标为候选字体；验证：在中文槽位查看一个不含中文字形的拉丁字体，预览显示系统回退样式，且界面文案明确这是 best-effort
- [x] 4.5 更新 `DESIGN.md` 中 Canvas Font 默认栈和字体策略说明，反映西文在前与双槽位 best-effort；验证：文档中的默认栈与 `model.DEFAULT_FONT` 一致

## 5. 集成验证

- [x] 5.1 在 Chromium 中走完整流程：导入 `samples/songs_test.md`、拖入分类、分别选择西文/中文字体、修改字号/行距、增删页面、导出 PNG；验证：拉丁字符使用西文字体、中文按回退使用中文字体（或记录已知的西文覆盖例外），换行/列宽/块高随字体变化重新计算，PNG 与画布一致
- [x] 5.2 保存并重新加载含双槽位的项目，再加载一个无 `fontPair` 的旧项目；验证：双槽位项目槽位提示恢复、字体渲染一致；旧项目字体不变、无报错
- [x] 5.3 断网后重复字体选择与导出；验证：不产生网络请求，字体列表来自本机会话缓存，导出正常
- [x] 5.4 检查控制台无新增错误，并确认未读取 `FontData.blob()`、未写入 `localStorage`；验证：Network/Application 面板和代码搜索均无相关调用

## Workflow follow-up

- 实现和手动验证完成后，按项目流程归档 `add-latin-cjk-font-pair`。
