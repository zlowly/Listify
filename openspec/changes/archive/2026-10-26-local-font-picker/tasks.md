# Tasks

## 1. 基础与能力检测

- [x] 1.1 新建 `js/fontpicker.js`，挂载 `L.fontPicker`，实现 `isSupported()`（同时检查 `window.queryLocalFonts` 与 `navigator.queryLocalFonts`）和 `quoteFamily()`（转义反斜杠与双引号）；在 Chrome `file://` 控制台验证 `Listify.fontPicker.isSupported()` 为 `true`，并验证 `quoteFamily('A "B"')` 输出合法 CSS 字符串。
- [x] 1.2 在 `index.html` 的 `js/ui.js` 之后、`js/app.js` 之前加入 `<script src="js/fontpicker.js"></script>`；打开页面确认无控制台错误，且 `Listify.fontPicker` 在 `app.init` 前已存在。
- [x] 1.3 在 `DESIGN.md` 补充说明：Local Font Access 只枚举本机字体、不请求网络、不读取字体文件，因此不违反 No-Webfont Rule；复查说明与现有字体栈、零网络约束不矛盾。

## 2. 字体字段接入

- [x] 2.1 在 `js/ui.js` 增加 `fontField(prefix, style)`，输出 `fontFamily` 输入框和“选择”按钮；让 `categoryStyleFields()` 与 `textStyleFields()` 都使用它；分别选中分类块和自由文字，确认分类名、歌名、自由文字三处都出现按钮，输入框原值不变。
- [x] 2.2 增加 `bindFontField(prefix, style)`，按钮点击调用 `L.fontPicker.open({ currentValue: style.fontFamily, onPick })`；`onPick` 更新 `style.fontFamily`、同步输入框并调用 `L.app.changed({ property: false })`；点击三处按钮都能打开选择器，手输输入框仍能独立改字体并重绘。
- [x] 2.3 当 `L.fontPicker.isSupported()` 为 false 时禁用“选择”按钮并给出 `title` 说明；在控制台临时把 `Listify.fontPicker.isSupported` 覆盖为 `false` 后重新渲染属性面板，验证按钮禁用、输入框仍可编辑。
- [x] 2.4 验证选择器关闭后属性面板仍显示当前值：打开选择器后按 Escape，确认输入框、`style.fontFamily` 和画布均未变化。

## 3. 授权、枚举与状态

- [x] 3.1 实现 `open()` 的 modal 外壳（搜索框、状态区、列表容器、footer 的“关闭/重新获取”），并确保 `queryLocalFonts()` 在“选择”或“重新获取”的点击处理函数中同步调用，任何 `await` 之前完成；用有头 Chrome 真实点击首次“选择”，确认出现本机字体授权提示、弹窗显示加载状态。
- [x] 3.2 将 `FontData[]` 归一化为族级记录：按 `family` 小写去重、保留 `fullName/postscriptName`、累计字面数；用 `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })` 排序；验证列表没有重复族、统计数与实际数据一致。
- [x] 3.3 实现加载、拒绝/空结果、异常三种状态：分别显示加载提示、无权限/无字体说明、错误信息，并提供“重试”和手输提示；在 Chrome 授权提示点“拒绝”验证不崩溃、原字体不变；把 API 临时替换为返回空数组/抛错验证对应状态。
- [x] 3.4 实现内存缓存与“重新获取”：成功枚举后关闭再打开不再次请求；点“重新获取”会重新调用 API 并替换列表；用控制台计数或观察授权提示确认首次与再次打开的差异。
- [x] 3.5 验证无自动枚举：刷新页面、打开分类块属性、打开自由文字属性，均不出现授权提示；只有点击“选择”后才调用 API。

## 4. 列表、搜索、预览与应用

- [x] 4.1 渲染字体族列表，顶部固定“系统默认”行；每行用对应字体显示“歌单 Playlist 123”预览，字号固定且长族名不撑破布局；验证列表可见、预览字体随行变化（本机无中文字体时 tofu 属预期）。
- [x] 4.2 实现搜索：对 `family/fullName/postscriptName` 做不区分大小写匹配，空查询恢复全部；“系统默认”行始终显示；输入 `noto` 验证过滤结果，清空后恢复。
- [x] 4.3 实现选择写回：写入 `quoteFamily(family) + ', sans-serif'`，同步输入框、关闭弹窗并调用 `changed({ property: false })`；选择 `Adwaita Mono` 验证值为 `"Adwaita Mono", sans-serif`，画布立即更新。
- [x] 4.4 实现“系统默认”写回 `L.model.DEFAULT_FONT`；选择后验证输入框显示完整默认栈，画布恢复默认字体。
- [x] 4.5 验证取消不写入：Escape、点击遮罩、关闭按钮三种方式退出后，`fontFamily` 与输入框保持原值。

## 5. 样式与可访问性

- [x] 5.1 在 `style.css` 增加 `.font-control`、`.font-picker-search`、`.font-picker-status`、`.font-picker-list`、`.font-row`、`.font-preview`、空/错误状态样式；在 1440px 和窄窗口下检查输入框与按钮同排、列表 `max-height` 生效、弹窗不溢出。
- [x] 5.2 给搜索框加可访问名称，字体行支持 Tab 聚焦和 Enter 选择，Escape 关闭；用键盘完整走一遍打开、搜索、选择、取消，不依赖鼠标。
- [x] 5.3 检查长字体族名、长错误文案和中文标签不重叠、不截断关键信息；必要时加省略号或换行，验证视觉可读。

## 6. 集成行为

- [x] 6.1 选一个与原字体宽度差异明显的字体，确认换行、自动列宽、分类块高度和自由文字高度按新字体重新计算；对比选择前后的画布截图。
- [x] 6.2 选择字体后保存项目、刷新页面、加载 JSON，确认 `fontFamily` 字符串往返一致且画布渲染相同；再加载一个含手输字体栈的旧项目，确认值不被改写。
- [x] 6.3 选择本机字体后导出 PNG，检查图片中的文字使用该字体；字体缺字时按浏览器回退规则显示；确认导出仍等待字体加载且无控制台错误。
- [x] 6.4 在 Firefox/Safari（或临时把 `isSupported` 置为 false）验证降级：按钮不可用或隐藏，手输输入框和画布仍正常工作。
- [x] 6.5 断网后打开选择器并授权，确认字体列表仍能加载和选择；在 DevTools Network 中确认无请求，并确认 localStorage 没有新增字体列表缓存。

## 7. 回归

- [x] 7.1 通过 `file://` 打开 `index.html`，完整走一遍：导入歌单 → 拖入分类 → 改分类名字体 → 改歌名字体 → 添加自由文字并改字体 → 保存 → 重新加载 → 导出；确认无控制台错误、无布局回归。
- [x] 7.2 运行 `openspec validate "local-font-picker" --strict`，确认该 change 的 proposal/specs/design/tasks 仍通过校验。

## Workflow follow-up

- 使用 `/opsx-apply` 按本任务清单实施；实施完成并经项目审查后再归档该 change。
