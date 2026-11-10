# Design

## Context

- 纯 `html + js`、零构建、`file://` 直接打开；唯一运行时依赖是 vendored LeaferJS。无测试套件，验证靠浏览器手动走查或 `agent-browser`。
- 当前字体模型是双槽位：`js/model.js` 用 `DEFAULT_LATIN_FONT` / `DEFAULT_CJK_FONT` 组合出 `DEFAULT_FONT`，样式可带 `fontPair: { latin, cjk }`；`normalizeStyle` 在存在 `fontPair` 时重新组合 `fontFamily`。
- UI 在 `js/ui.js` 的 `fontField` / `bindFontField` 中渲染“西文 / 中文”两个按钮、完整字体栈输入框和槽位状态；分类名、歌名和自由文字共用这套字段。
- 选择器 `js/fontpicker.js` 的 `open({ slot })` 依赖 `slot` 决定标题、示例和默认栈；“系统默认”返回 `null`。
- 序列化在 `js/io.js` 的 `serializeStyle`：写入 `fontFamily`，有 `fontPair` 时一并写入；加载走 `normalizeStyle`。
- 元素创建集中在 `js/model.js` 的 `createCategoryElement` / `createTextElement`；拖入分类和添加文字分别在 `js/app.js` 的 `onDrop` / `addText`。`js/layout.js` 的自检会用没有 `pages` 字段的伪项目调用 `createCategoryElement`。
- 现有 `font-selection` 规范完整描述了双槽位、`fontPair`、西文优先和默认西文/中文栈；本次需要把这些要求替换为有序字体列表。

## Goals / Non-Goals

**Goals:**

- 用一条有序字体列表同时表达“选哪些字体”和“回退顺序”，界面只保留列表、添加、替换、删除。
- 新样式只有一项“系统默认”，列表始终至少一项。
- 分类名、歌名、自由文字三处体验一致；支持本机字体选择时不需要手输字体名，不支持时有可用的文本降级。
- 新增分类块和自由文字时，分别按同类型来源继承完整文字样式，减少重复配置。
- 旧项目继续按已保存的 `fontFamily` 渲染；新项目数据可被旧版本按 `fontFamily` 读取。

**Non-Goals:**

- 字体行拖动排序。
- 字体列表的跨项目/全局复用。
- 按字形覆盖自动筛选字体，或读取字体文件内容。
- 把继承做成实时联动。
- 修改项目版本号、草稿 schema 或 PNG 导出格式。

## Decisions

### D1. `fontFamilies` 是唯一字体选择来源

样式新增：

```js
{
  fontFamilies: ['Inter', 'Noto Sans SC'], // 有序，至少一项
  fontFamily: '"Inter", "Noto Sans SC", sans-serif' // 派生值
}
```

- `fontFamilies` 是用户编辑的列表，顺序即 CSS 回退优先级。
- `fontFamily` 保留为派生 CSS 栈，渲染、导出、旧版本读取和 `model.fontString` 继续使用它。
- `sans-serif` 是“系统默认”的哨兵，只允许作为唯一项出现；有具体字体时不把 `sans-serif` 放进列表，派生栈末尾隐式补上。
- 新增模型辅助：
  - `normalizeFontFamilies(list)`：逐项 trim、去引号、去空、按不区分大小写去重；若存在具体字体则移除 `sans-serif`；结果为空时返回 `['sans-serif']`。
  - `fontFamiliesFromFamily(fontFamily)`：用现有 `splitFontStack` / `cleanFamilyName` 拆分旧栈，去掉末尾或中间的 `sans-serif`，去重；没有具体字体时返回 `['sans-serif']`。
  - `fontFamilyFromList(list)`：归一化后逐项输出，generic family 不引号，其余用 `quoteFamily`；末尾没有 `sans-serif` 时追加。
  - `applyFontFamilies(style, list)`：写入归一化后的 `fontFamilies`，重算 `fontFamily`，删除 `fontPair`。
- 删除 `normalizeFontPair`、`composeFontFamily`、`applyFontPair`、`DEFAULT_LATIN_FONT`、`DEFAULT_CJK_FONT` 及其导出；保留 `quoteFamily`、`splitFontStack`、`cleanFamilyName`、`normalizeFontStack`、`fontStackIsValid` 供旧栈解析和渲染兜底。

替代方案：继续保留双槽位、只把 UI 简化。这样仍需 `fontPair` 组合逻辑和槽位默认栈，数据与界面会继续分叉，不能解决“列表顺序就是回退顺序”的心智模型。

### D2. 默认与旧项目兼容

- `DEFAULT_FONT = 'sans-serif'`；`DEFAULT_TITLE_STYLE` / `DEFAULT_SONG_STYLE` / `DEFAULT_TEXT_STYLE` 增加 `fontFamilies: ['sans-serif']`。
- `normalizeStyle` 的分支：
  1. 若 `style.fontFamilies` 是数组：归一化列表，并用 `fontFamilyFromList` 重算 `fontFamily`。
  2. 否则：从已保存的 `fontFamily` 拆出列表；保留原 `fontFamily` 字符串用于渲染。只有原值为空时才回退到 `DEFAULT_FONT`。
  3. 无论哪条分支都 `delete style.fontPair`。
- 旧项目带 `fontPair` 时忽略它，以已保存的 `fontFamily` 为准；旧项目的长默认栈会显示成多行，这是接受的代价，数据不被静默重写。
- 项目版本仍为 3：`fontFamilies` 是新增可选字段，旧应用忽略它并按 `fontFamily` 渲染；草稿 schema 不变。

替代方案：升级项目版本并强制迁移旧 `fontPair`。会把“打开旧项目”变成改写数据，且无法保证旧版本回读，收益不足。

### D3. 字体列表编辑器

三处字段统一替换为 `fontListField(prefix, style)` + `bindFontList(prefix, style)`，替换现有 `fontField` / `bindFontField`。

```text
字体
+--------------------------------------+
| 系统默认                         [x] |  <- 仅剩一项时 [x] 禁用
| Inter                            [x] |
| Noto Sans SC                     [x] |
| + 添加字体                           |
| 按列表顺序回退；至少保留一个字体。   |
+--------------------------------------+
```

- 支持本机字体选择：
  - 行主体是按钮，显示字体名；点击打开 `L.fontPicker.open({ currentValue, onPick })`，替换该行。
  - 行尾删除按钮；`fontFamilies.length <= 1` 时禁用。
  - “添加字体”打开选择器，`onPick` 追加到末尾；当前只有 `['sans-serif']` 时用新字体替换默认项。
  - 选择“系统默认”时移除该具体字体行；列表为空则回到唯一的 `['sans-serif']`。
- 不支持本机字体选择：
  - 行主体变为文本输入；默认项显示空值，placeholder 为“系统默认”。
  - 文本行在 `change` / Enter 时提交，避免每次 `input` 重渲染导致焦点丢失；空白提交表示清除该行，全部为空则回到默认项。
  - 底部提供手动添加输入，Enter 或确认按钮追加；同样遵守“默认项 + 添加 = 替换默认项”。
  - 删除按钮语义与支持路径一致。
- 任意提交后统一调用：
  1. `model.applyFontFamilies(style, nextList)`
  2. `L.app.changed({ property: false })` 重绘画布
  3. `ui.renderPropertyPanel()` 刷新列表行
- 不使用 `ui.renderAll()`，避免整个侧栏/画布重建；但属性面板需要重渲染以同步行内容。
- CSS 用 `.font-list`、`.font-list-row`、`.font-list-name`、`.font-list-delete`、`.font-list-add`、`.font-list-input`、`.font-list-manual` 替换 `.font-pair-*`，保持 27px 控件密度。

替代方案：保留完整字体栈输入框作为高级入口。用户明确要求“简单列表”，完整栈会让“列表顺序”和“手输栈”两个真相源再次并存，故移除。

### D4. 选择器去掉槽位

- `open(options)` 不再读取 `slot`；`currentValue` 为空表示当前行是默认项。
- 标题统一为“选择字体”；示例统一为 `歌单 Playlist 123 ABC`，同时覆盖中文和拉丁字符。
- 顶部“系统默认”行始终存在且不受搜索过滤；选择它时 `onPick(null)`，由列表编辑器解释为“清除这一行/回到默认”。
- 保留现有授权、枚举、按族去重、自然排序、搜索、会话缓存、重新获取、隐私和离线行为。
- 错误/空状态文案去掉“可直接手输字体族”，改为“重试”或“关闭”；不支持 API 的降级由列表编辑器负责。
- `fontpicker.js` 不再依赖 `DEFAULT_LATIN_FONT` / `DEFAULT_CJK_FONT`。

### D5. 样式继承

新增模型辅助 `findStyleSource(project, page, type, y)`：

```text
同页 elements 中 type 匹配的候选
  -> 1. y <= 新元素 y 的候选中取 y 最大者（并列取文档顺序靠后）
  -> 2. 否则取同页 |y - 新 y| 最小者（并列取文档顺序靠后）
  -> 3. 否则按 project.pages 顺序、page.elements 顺序取最后一个 type 匹配者
  -> 4. 没有则 null
```

- 必须容忍 `project.pages` 缺失或不是数组：直接返回 `null`，让 `js/layout.js` 的伪项目自检继续使用默认样式。
- `createCategoryElement(categoryName, x, y, project, width, page)` 增加可选 `page`；有来源时：
  - `titleStyle = copyStyle(source.titleStyle)`
  - `songStyle = copyStyle(source.songStyle)`
  - `showTitle` 仍为 `true`，位置/宽度/表格仍按新块规则。
- `createTextElement(project, text, page)` 增加可选 `page`；有来源时 `style = copyStyle(source.style)`。
- `copyStyle` 已经深拷贝，天然满足“快照不联动”；继承后确保没有 `fontPair`（`normalizeStyle`/`applyFontFamilies` 会清理）。
- 调用方：
  - `app.onDrop` 把 `page` 传给 `createCategoryElement`。
  - `app.addText` 把 `page` 传给 `createTextElement`。
- 省略 `page` 时不做继承，保持现有 API 的向后兼容；这也让 layout 自检不需要构造完整项目。

替代方案：在 `app.js` 创建后手工覆盖样式。会把继承规则拆散在调用点，且新增其它创建入口时容易漏掉；放在模型创建函数里更一致。

### D6. 序列化与加载

`io.serializeStyle`：

```js
const list = Array.isArray(style.fontFamilies)
  ? model.normalizeFontFamilies(style.fontFamilies)
  : model.fontFamiliesFromFamily(style.fontFamily);
return {
  fontFamilies: list,
  fontFamily: model.fontFamilyFromList(list),
  ...
};
```

- 不再写 `fontPair`。
- `loadStyle` 继续 `model.normalizeStyle(model.copyStyle(style))`。
- 旧项目没有 `fontFamilies` 时保留 `fontFamily` 原值；新项目两者一致。
- 项目版本、草稿 schema、导入校验结构不需要新增字段校验；缺失 `fontFamilies` 是合法的旧数据。

### D7. 文档与验证

- `DESIGN.md`：Canvas Font 改为默认 `sans-serif`；字体策略改为有序列表；删除双槽位段落；保留 No-Webfont 和本机字体隐私说明。
- `PRODUCT.md`：能力摘要加入“有序字体列表 + 新建同类子分区继承样式”。
- `docs/歌单生成器需求.md`：子分区字体说明改为列表和继承。
- 验证路径：
  - 新项目三处字体字段都只有“系统默认”。
  - 支持浏览器：点行替换、添加、删除、最后一行不可删、选“系统默认”清行；画布和导出同步。
  - 不支持浏览器（可用 DevTools 删除 `queryLocalFonts` 模拟）：文本行编辑、手动添加、删除限制。
  - 分类：同页上方最近、同页仅下方、跨页兜底、无来源默认、快照不联动。
  - 自由文字：同上。
  - 旧项目：长 `fontFamily` + `fontPair` 加载后画面不变、列表拆行、保存后不再有 `fontPair`；旧版本仍能按 `fontFamily` 读取。
  - `js/layout.js` 自检仍通过。

## Risks / Trade-offs

- [“系统默认”既是行又是哨兵，用户可能不理解为什么添加字体会替换它] → 列表中保留一行提示；添加时直接替换默认项，避免出现永远命不中的后续字体。
- [旧项目长默认栈会显示很多行] → 接受；这是“不静默改写旧项目”的代价，用户可逐行删除。
- [`fontFamily` 与 `fontFamilies` 可能不同步] → 所有写入走 `applyFontFamilies`；加载/保存都重新归一化；渲染只读 `fontFamily`。
- [属性面板重渲染导致输入焦点丢失] → 降级文本行只在 `change` / Enter 提交，不在每次 `input` 重渲染；支持路径是按钮点击，不存在输入焦点问题。
- [继承来源在“添加到页面顶部”时取到下方块] → 这是规则 2 的刻意行为；同页没有上方块时取最近块，避免总是回退到默认。
- [删除 `fontPair` 后遗漏调用点] → 全局搜索 `fontPair`、`normalizeFontPair`、`composeFontFamily`、`applyFontPair`、`DEFAULT_LATIN_FONT`、`DEFAULT_CJK_FONT`，在 model/ui/fontpicker/io 全部清理。
- [layout 自检使用伪项目] → 继承 helper 对 `project.pages` 做数组检查；`page` 参数可选。
- [手输字体名可能包含引号/逗号] → 复用 `cleanFamilyName` 和 `quoteFamily`；列表项视为单个字体族，不把逗号当分隔符。

## Migration Plan

1. 先在 `model.js` 落地字体列表辅助、默认值和 `normalizeStyle`，保留旧函数但停止调用，确认旧项目加载仍按原 `fontFamily` 渲染。
2. 改造 `io.serializeStyle`，停止写 `fontPair`，写入 `fontFamilies` 与派生 `fontFamily`。
3. 改造 `fontpicker.js` 去掉槽位；再改 `ui.js` 列表编辑器，最后接入 `app.js` 的创建入口。
4. 删除 `fontPair` 相关函数和导出，跑全局搜索确认无残留。
5. 更新 CSS、DESIGN、PRODUCT、需求文档。
6. 用 `agent-browser` 或手动走查新旧项目、支持/不支持字体 API 两条路径；无自动化测试套件。

回滚：恢复旧版 `model.js` / `ui.js` / `fontpicker.js` / `io.js` 即可；旧项目数据未被改写，新项目中的 `fontFamilies` 会被旧版忽略，仍可按 `fontFamily` 渲染。

## Open Questions

无。第一版不排序、不做实时继承、不改版本号，均已在范围中明确。
