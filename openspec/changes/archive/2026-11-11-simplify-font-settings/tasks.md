# Tasks

## 1. 字体模型与默认值

- [x] 1.1 在 `js/model.js` 增加 `normalizeFontFamilies`、`fontFamiliesFromFamily`、`fontFamilyFromList`、`applyFontFamilies` 并导出；验证：`node --check js/model.js` 通过，浏览器控制台断言 `normalizeFontFamilies([' Inter ', 'inter', 'sans-serif'])` 得到 `['Inter']`、`fontFamilyFromList(['Inter','Noto Sans SC'])` 得到 `"Inter", "Noto Sans SC", sans-serif`、`applyFontFamilies({}, [])` 得到 `fontFamilies: ['sans-serif']` 且无 `fontPair`。
- [x] 1.2 把 `DEFAULT_FONT` 改为 `'sans-serif'`，给三个默认样式加 `fontFamilies: ['sans-serif']`；验证：`Listify.model.createDefaultProject()` 中分类与文字的 `titleStyle`/`songStyle`/`style` 都只有“系统默认”一项，`fontFamily` 为 `sans-serif`。
- [x] 1.3 改写 `normalizeStyle`：有 `fontFamilies` 时归一化并重算 `fontFamily`；没有时从旧 `fontFamily` 拆列表但保留原 `fontFamily`；两种分支都删除 `fontPair`；验证：控制台分别加载“新格式样式”“只有 fontFamily 的旧样式”“带 fontPair 的旧样式”，断言列表、`fontFamily` 和 `fontPair` 删除结果符合设计 D2。
- [x] 1.4 更新 `DESIGN.md` 字体章节、`PRODUCT.md` 能力摘要和 `docs/歌单生成器需求.md` 子分区字体说明，改为有序字体列表和“系统默认”；验证：三份文件不再把双槽位/`fontPair` 描述为当前方案，`rg -n "fontPair|DEFAULT_LATIN|DEFAULT_CJK|西文|中文槽位" DESIGN.md PRODUCT.md docs/歌单生成器需求.md` 只剩历史迁移说明或没有匹配。

## 2. 序列化与旧项目兼容

- [x] 2.1 改写 `js/io.js` 的 `serializeStyle`：写入归一化 `fontFamilies` 和派生 `fontFamily`，不再写 `fontPair`；验证：`node --check js/io.js` 通过，浏览器控制台对一个样式调用 `Listify.io.serializeProjectStructure(project)`，检查输出含 `fontFamilies`、无 `fontPair`，`fontFamily` 与列表一致。
- [x] 2.2 验证旧项目加载路径：构造只有 `fontFamily` 或同时有 `fontPair` 的项目结构走 `normalizeStyle`，确认旧 `fontFamily` 原样保留、列表由它拆出、`fontPair` 被忽略；验证：控制台断言两种旧结构加载后的 `fontFamily` 与原始值相同，且新保存结构不含 `fontPair`。

## 3. 字体选择器

- [x] 3.1 改造 `js/fontpicker.js` 的 `open(options)`：移除 `slot`/`isCjk`，标题统一为“选择字体”，示例统一为 `歌单 Playlist 123 ABC`，顶部“系统默认”始终存在并 `onPick(null)`；验证：`node --check js/fontpicker.js` 通过，在浏览器控制台临时 stub `navigator.queryLocalFonts` 返回两个字体后打开选择器，确认标题、混合示例、系统默认项和选择回调。
- [x] 3.2 清理选择器拒绝/空结果/异常文案，不再提示手输字体族；验证：分别 stub 拒绝、空数组、抛错三种 `queryLocalFonts`，确认显示错误/空状态与重试入口，字体样式不被修改。

## 4. 字体列表编辑器

- [x] 4.1 在 `js/ui.js` 用 `fontListField`/`bindFontList` 替换 `fontField`/`bindFontField` 的支持路径：行按钮打开选择器替换该行，添加追加，删除在只剩一行时禁用，选择“系统默认”移除该行；验证：`node --check js/ui.js` 通过，stub 字体 API 后操作列表，确认 `style.fontFamilies` 与 `style.fontFamily` 同步、画布重绘且属性面板刷新。
- [x] 4.2 实现不支持字体 API 的降级路径：行变文本输入、默认项空值/占位符、`change`/Enter 提交、底部手动添加、空白清除和至少一项限制；验证：在 DevTools 将 `window.queryLocalFonts` 与 `navigator.queryLocalFonts` 置空后刷新，编辑/添加/删除文本行，确认不调用 API、不丢焦点、列表与渲染结果正确。
- [x] 4.3 把列表编辑器接入分类名、歌名和自由文字三处属性面板；验证：分别选中分类块和自由文字，确认三处都显示同一个列表编辑器，不再出现“西文 / 中文”按钮或完整字体栈输入框。
- [x] 4.4 用 `.font-list*` 类替换 `.font-pair-*` 样式并保持 27px 控件密度；验证：`rg -n "font-pair" js style.css` 无残留引用，浏览器中列表行、删除按钮、添加按钮和提示文案对齐且不溢出。

## 5. 样式继承

- [x] 5.1 在 `js/model.js` 增加 `findStyleSource(project, page, type, y)`：同页上方最近 → 同页最近 → 项目文档顺序最后一个同类型 → `null`，并对 `project.pages` 做数组检查；验证：`node --check js/model.js` 通过，控制台用伪项目和不同 y 值断言四种优先级及缺少 `pages` 时返回 `null`。
- [x] 5.2 给 `createCategoryElement` 增加可选 `page` 参数，有来源时分别深拷贝 `titleStyle` 与 `songStyle`，保持 `showTitle`、位置、宽度和表格为新块默认；验证：控制台创建两个分类块，确认样式分别继承、后改来源不联动、关闭来源 `showTitle` 不影响新块。
- [x] 5.3 给 `createTextElement` 增加可选 `page` 参数，有来源时深拷贝完整 `style`，不复制内容/位置/宽度/层级；验证：控制台创建两个自由文字，确认样式快照继承且几何与文案为新值。
- [x] 5.4 让 `app.onDrop` 和 `app.addText` 把当前页传给创建函数；验证：浏览器中拖入第二个分类、添加第二个文字，确认继承生效；同时运行 `js/layout.js` 自检，确认无 `pages` 的伪项目仍使用默认样式且不报错。
- [x] 5.5 更新 `PRODUCT.md` 和 `docs/歌单生成器需求.md` 的样式继承说明，并在 `DESIGN.md` 增加新建同类元素继承文字样式的简短说明；验证：文档描述与实现一致，明确快照继承、不复制几何/开关/内容。

## 6. 清理旧双槽位代码

- [x] 6.1 删除 `normalizeFontPair`、`composeFontFamily`、`applyFontPair`、`DEFAULT_LATIN_FONT`、`DEFAULT_CJK_FONT` 及其导出，更新所有调用点；验证：`rg -n "fontPair|normalizeFontPair|composeFontFamily|applyFontPair|DEFAULT_LATIN_FONT|DEFAULT_CJK_FONT" js index.html` 无残留（历史注释除外），`node --check` 通过所有改动的 JS 文件。
- [x] 6.2 确认选择器和列表编辑器不再读取槽位字段，`rg -n "slot|isCjk" js/fontpicker.js js/ui.js` 无相关逻辑；验证：搜索无结果，支持/不支持两条路径均可打开和编辑字体。

## 7. 集成验证

- [x] 7.1 新建项目走查：三处字体字段只有“系统默认”；stub 字体 API 后完成点行替换、添加、删除、最后一行不可删、选择系统默认清行；确认画布换行和分类块高度随字体变化，PNG 导出使用当前字体。
- [x] 7.2 继承走查：同页上方最近、同页只有下方、同页多个块取最近、跨页兜底、无来源默认；分类名与歌名分别继承，自由文字继承完整样式；修改来源后新元素不变。
- [x] 7.3 兼容走查：加载带长 `fontFamily` 和 `fontPair` 的旧项目，确认画面不变、列表拆成多行、保存后项目 JSON 无 `fontPair`；用旧版本结构检查 `fontFamily` 仍可渲染。
- [x] 7.4 回归检查：`js/layout.js` 自检通过；分类拖入、自由文字、属性面板、导出流程无报错；用 `agent-browser` 或手动走查结果记录在变更说明中。

## Workflow follow-up

- 实现和验证完成后，按项目评审要求归档该变更。
- 归档前确认 `openspec validate simplify-font-settings` 无错误。

## 走查记录（2026-11-10，agent-browser headless Chromium，file:// 打开）

- 环境：字体 API 以 `window.queryLocalFonts` stub 覆盖五态（两个字体 / 空数组 / NotAllowedError 拒绝 / 同步抛错 / 移除 API）；真实用户输入用 `fill` + `press Enter` 验证提交路径。
- 3.x 选择器：标题"选择字体"、每行示例统一 `歌单 Playlist 123 ABC`（含每行独立字体族预览）；系统默认行置顶且搜索 `noto` 时不被过滤；点系统默认 `onPick(null)`、点字体 `onPick(family)`，选择后弹窗关闭；拒绝→"未获得本机字体访问权限…重新获取"、空→"没有找到可用字体…重新获取"、抛错→"读取本机字体失败：boom-sync…重新获取"，三种状态均有重试入口且不修改现有字体列表。
- 4.x 列表编辑器（真实 UI）：支持路径点行替换、添加追加、删除、最后一行删除禁用、选系统默认移除该行；`fontFamilies` 与派生 `fontFamily` 同步、每次提交触发 `changed()` 重绘并刷新面板、标题/歌名两列表互不影响。降级路径（移除 API）：行变文本输入（默认项空值 + 占位符"系统默认"），真实输入 Enter 与 `change` 均提交、`input` 事件不重渲染不丢焦点、底部手动添加（仅默认项时替换默认项）、空白清除（多行删行 / 末行回到系统默认）、至少一项限制生效。
- 5.x 继承：`findStyleSource` 四级优先级实测（同页上方最近取 y=300、同页无上方取最近 y=100、跨页取文档顺序最后、无来源/缺 `pages` 返回 null）；分类 `titleStyle`/`songStyle` 分别继承、不复制位置/宽度/`showTitle`/表格；自由文字继承完整样式、不复制文案/位置/宽度；快照不联动（创建后把来源 43→99、50→66、48→77，新元素均不变）。
- 6.x 清理：`rg -n "fontPair|normalizeFontPair|composeFontFamily|applyFontPair|DEFAULT_LATIN_FONT|DEFAULT_CJK_FONT" js index.html` 仅剩 model.js 两处规格 D1/D2 要求的 `delete style.fontPair`；`rg -n "slot|isCjk" js/fontpicker.js js/ui.js` 无匹配；`node --check` 六个改动 JS 全过。
- 7.1 新建项目：三处字体字段均只有"系统默认"一行；标题字号 44→80 后分类块高度 170.4→213.6（随字体重排）；`fontString` 使用当前派生栈；完整页 PNG（1080×1920）与仅歌单层 PNG 均生成有效。
- 7.3 兼容：旧项目（长 `fontFamily` + `fontPair`）加载后原栈原样保留、`fontPair` 删除、列表拆成 3 行（面板 6 行）；重新保存的 JSON 无 `fontPair`、含 `fontFamilies` 且 `fontFamily` 与列表一致；渲染与 `fontString` 仍按原栈工作。
- 7.4 回归：新建项目→导入→拖入两个分类→添加两个文字→面板字体增删→表格列数修改→新增/切换页→PNG 渲染→JSON 往返（`validateProject` + `loadProjectFile`）全流程，`pageerror`/`unhandledrejection` 捕获 0 条；`layout.devChecks()` 66/66 通过。
- 文档：`PRODUCT.md` 能力摘要、`DESIGN.md` 字体策略与继承段、`docs/歌单生成器需求.md` 子分区字体及分类块/自由文字继承说明已同步；`rg -n "fontPair|DEFAULT_LATIN|DEFAULT_CJK|西文|中文槽位" DESIGN.md PRODUCT.md docs/歌单生成器需求.md` 无匹配。
