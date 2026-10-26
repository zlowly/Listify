# Design

## Context

- 项目是零构建的经典脚本应用：`index.html` 按顺序加载 `js/model.js`、`layout.js`、`import.js`、`render.js`、`io.js`、`export.js`、`ui.js`、`app.js`，没有模块打包或 `package.json`。
- 字体设置目前只有自由文本输入：`js/ui.js` 的 `categoryStyleFields()` 和 `textStyleFields()` 都渲染 `fontFamily` 输入框；`bindCategoryStyle()` 和 `renderTextProperties()` 把输入写回 `style.fontFamily` 并调用 `L.app.changed({ property: false })`。
- `changed({ property: false })` 只调用 `redraw()`；`redraw()` 经 `renderer.drawPage()` 走到 `layout.measureText()`，所以字体变化会重新计算换行、列宽和分类块高度，而不只是换字形。
- `model.fontString(style)` 生成 `weight size px family`；`io.serializeStyle()` 已把 `fontFamily` 作为字符串持久化；`export.waitForAssets()` 已等待 `document.fonts.ready`。因此不需要改数据模型、布局、渲染或导出逻辑。
- `ui.modal.open()` 已提供遮罩、标题、关闭按钮、Escape/遮罩关闭和 footer actions；字体选择器复用它，避免新增一套弹层。
- 本机验证（Chromium 156、Linux、`file://`）：`file://` 是安全上下文；API 在当前版本挂在 `window.queryLocalFonts`，`navigator.queryLocalFonts` 为 `undefined`；必须在用户点击的同一任务里调用，否则抛 `SecurityError: User activation is required`；授权被拒或没有字体时可能返回空数组而不是抛错；测试环境返回 125 个字面 / 24 个族。测试机没有中文字体，因此中文预览会显示 tofu；这正好作为字形覆盖的提示，不是缺陷。
- `DESIGN.md` 的 No-Webfont Rule 禁止网络字体。Local Font Access 只枚举本机已安装字体、不发起网络请求，因此不违反该规则；需要在 DESIGN.md 补一句说明。

## Goals / Non-Goals

**Goals:**

- 用同一个选择器覆盖分类名、歌名和自由文字三处字体设置，行为一致。
- 保留现有手输字体族输入框作为唯一数据入口；选择器只负责填充它，不引入新的字体数据模型。
- 首次点击时完成授权与枚举，之后同一会话复用缓存；失败时保持原字体并给出可恢复的提示。
- 选择后立即重排/重绘，保存、加载、导出行为与现有字体完全一致。

**Non-Goals:**

- 不实现具体字面（Bold/Italic/Condensed）选择；粗细继续由现有“粗细”控件控制。
- 不导入字体文件、不读取 `FontData.blob()`、不做字体子集化或 CJK 覆盖检测。
- 不为 Firefox/Safari 提供本机字体枚举；这些浏览器只保留手输回退。
- 不把字体列表持久化到 localStorage 或项目 JSON；不跨会话缓存。
- 不在第一版做虚拟列表；如果字体族数量导致卡顿，再单独优化。

## Decisions

### 1. 新增共享的 `js/fontpicker.js`

新增 `js/fontpicker.js`，暴露 `L.fontPicker`，提供 `isSupported()`、`quoteFamily()` 和 `open(options)`。脚本放在 `js/ui.js` 之后、`js/app.js` 之前；选择器在 `ui.js` 渲染字体字段时只调用 `isSupported()`，点击时调用 `open()`，因此加载顺序不会造成初始化依赖。

选择器内部复用 `ui.modal.open()`：body 由 DOM 节点构建（字体名用 `textContent`，不拼 HTML），footer 放“关闭”和“重新获取”。这样 Escape、遮罩关闭、标题和焦点行为与导出弹窗一致。

替代方案是直接在 `ui.js` 里写选择器，但三处入口会重复；独立文件更便于以后增加“最近使用”或字体分组，而不改属性面板。

### 2. 字段结构：输入框 + “选择”按钮

在 `ui.js` 增加 `fontField(prefix, style)`，输出：

```html
<div class="font-control">
  <input id="prefix-family" class="input" ...>
  <button id="prefix-family-pick" class="btn btn-sm">选择</button>
</div>
```

`categoryStyleFields()` 与 `textStyleFields()` 都改用它；`bindCategoryStyle()` 和 `renderTextProperties()` 调用新的 `bindFontField(prefix, style)`。按钮在 `L.fontPicker.isSupported()` 为 false 时禁用，并加 `title` 说明，但输入框始终可用。

选择器不直接操作 `style`，而是通过 `onPick(value)` 回调把最终 CSS 字体值交给调用方；调用方负责：

```js
style.fontFamily = value;
const input = document.getElementById(prefix + '-family');
if (input) input.value = value;
L.app.changed({ property: false });
```

这样选择器与三处属性面板解耦，也避免它知道 `element`、`style` 或面板重渲染细节。

### 3. API 检测与调用时机

支持检测同时看两个挂载点：

```js
const query = (typeof window.queryLocalFonts === 'function' && window.queryLocalFonts) ||
              (typeof navigator.queryLocalFonts === 'function' && navigator.queryLocalFonts);
```

当前 Chromium 156 用 `window`，但规范/其它版本可能用 `navigator`；只看一个会误报“不支持”。调用时用 `query.call(window/navigator)` 保持接收者正确。

关键约束：`queryLocalFonts()` 必须在“选择”按钮或“重新获取”按钮的点击处理函数中**同步**调用，不能先 `await` 打开弹窗、加载缓存或做动画。`ui.modal.open()` 和 DOM 写入都是同步的，所以顺序是：

1. 同步打开 modal、渲染加载状态；
2. 同一个点击任务里立即调用 `queryLocalFonts()`；
3. 用 `.then/.catch` 渲染结果。

如果缓存已存在，则不调用 API，直接渲染缓存；只有“重新获取”会再次同步调用。这样既满足 transient activation，也避免每次打开都弹权限。

替代方案是“先打开弹窗，再让用户点‘读取字体’”，会多一次点击；当前方案在用户已经明确点“选择”后直接发起授权，更符合验证页的体验。

### 4. 字体族归一化、排序与搜索

对 `FontData[]` 做一次遍历：

- `family = (font.family || font.fullName || font.postscriptName || '').trim()`；空值跳过。
- 用 `family.toLocaleLowerCase()` 作为去重键，保留第一次出现的 `family/fullName/postscriptName`，并累计 `faces` 数量。
- 只保留族级记录；同一族的 Regular/Bold/Italic 不进入列表，粗细仍由现有控件控制。
- 排序用 `new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`；`undefined` 跟随浏览器语言（中文环境按拼音/本地规则），数字段自然排序；若 `Intl.Collator` 不可用则退回 `localeCompare`。
- 搜索对 `family/fullName/postscriptName` 做 `toLocaleLowerCase().includes(query)`；空查询显示全部。“系统默认”行固定在列表最上面，不参与过滤。

列表头部显示“24 个字体族 · 125 个字面”之类的统计，帮助用户判断是否加载完整；这不是 spec 的硬性要求，但成本很低。

### 5. 预览与行交互

每行是一个可点击的按钮/行，包含字体族名和预览文本。预览用该字体渲染固定示例：

```html
<span class="font-preview" style="font-family: &quot;Family&quot;, sans-serif">歌单 Playlist 123</span>
```

字体族名经过 `quoteFamily()` 转义后写入 `style.fontFamily`；预览字号固定 20px（不跟随目标字号，避免大字号把列表撑坏）。中文示例是有意保留的：字体缺少中文字形时会显示 tofu，用户能直接看出该字体是否适合自己的歌单；不做 cmap/CJK 覆盖检测，因为那需要读取字体文件 blob，超出本变更的隐私边界。

点击行即应用并关闭；当前字体如果与某行写入值完全一致，可给该行加选中样式（可选，不改变行为）。搜索框在打开后聚焦；列表为空时显示空状态，不显示空白面板。

### 6. 写回值：引号族名 + `sans-serif`

选择结果格式为：

```js
quoteFamily(family) + ', sans-serif'
// 例如 "Adwaita Mono", sans-serif
```

`quoteFamily()` 转义反斜杠和双引号，避免族名中的特殊字符破坏 CSS。选择“系统默认”时写入 `L.model.DEFAULT_FONT`（现有完整回退栈），而不是写 `sans-serif`。

不保留用户原来的回退栈：从 `fontFamily` 字符串里可靠地拆出“第一个族名 + 其余回退”需要解析引号和逗号，容易出错；选择器只负责给出一个确定、可预测的值，用户仍可在输入框里手动补回退。替代方案是“替换第一个族、保留尾部”，但遇到 `"A, B", C` 这类值会解析错误，因此不采用。

### 7. 缓存、失败与重试

`L.fontPicker` 内部保存 `families` 和 `faces`（仅内存）。成功枚举后写入缓存；再次打开直接渲染。`重新获取` 强制重新调用 API，成功后替换缓存。

失败处理：

- 无 API：按钮禁用，输入框旁提示“当前浏览器不支持本机字体选择，可手输字体族”。
- 授权被拒：显示“未获得本机字体访问权限”，提供“重试”和手输提示；如果 Chrome 不再弹窗，提示用户到地址栏左侧站点设置里重新允许。
- 空数组：显示“没有找到可用字体”，保留重试和手输。
- 异常：显示错误文本；如果已有缓存，保留旧列表并提示刷新失败，不清空当前字体。
- 加载中：显示进度文本，禁用“重新获取”，避免并发请求。

关闭弹窗后，未完成的 promise 仍可能 resolve；用 `closed` 标志或请求序号丢弃过期结果，避免往已销毁的 DOM 写内容。

### 8. 渲染、持久化与导出

不修改 `model.fontString()`：它已经接受带引号的族名。选择器写入的字符串会进入现有 `layout.measureText()`/`renderer.drawPage()` 路径，因此画布、换行、列宽、分类块高度立即更新。

`io.serializeStyle()` 已经保存 `fontFamily` 字符串；加载时不校验字体是否存在，正好符合“跨机器保留原值、CSS 回退”的要求。若以后要提示“本机未找到”，可在选择器打开且已有缓存时检查第一段族名是否在列表中，但这是可选增强，不进入本变更。

`export.waitForAssets()` 已等待 `document.fonts.ready`；本机字体不需要网络加载，导出仍走同一路径。无需新增导出逻辑。

### 9. 样式与可访问性

在 `style.css` 增加：

- `.font-control`：输入框和按钮同一行，输入框 `flex: 1`，按钮不换行。
- `.font-picker-search`、`.font-picker-status`、`.font-picker-list`、`.font-row`、`.font-row-name`、`.font-preview`、`.font-row.is-active`。
- 列表 `max-height: 56vh; overflow: auto`；行使用 `button` 或 `role="option"`，键盘可 Tab/Enter 操作；搜索框有 label/aria-label。
- 空状态/错误状态沿用现有 `.hint` 风格，不引入新的视觉体系。

## Risks / Trade-offs

- **Chrome-only** → 不支持时禁用按钮并保留手输；在属性面板说明原因，不让用户误以为功能坏了。
- **用户手势丢失** → 任何 `await` 之后再调用 API 都会失败；实现时把 `queryLocalFonts()` 放在点击处理函数的同步段，并用真实点击验证（不能只靠 headless 自动授权）。
- **`file://` 权限行为随版本/平台变化** → 首次点击可能弹窗、可能返回空数组；按“拒绝/空结果”统一处理，提供重试和手输回退。
- **API 挂载点差异** → 同时检测 `window` 与 `navigator`；不要只写 `navigator.queryLocalFonts`，当前 Chromium 156 会误判。
- **字体族数量大** → 一次性渲染所有预览可能卡顿；第一版不做虚拟列表，若实测超过几百个族再优化（例如 `content-visibility: auto` 或分页）。
- **中文缺字** → 预览显示 tofu 是预期行为；不自动过滤无中文字形的字体，否则用户可能不理解为什么列表变短。CJK 覆盖检测需要读取 blob，明确不做。
- **族名特殊字符** → 引号和反斜杠必须转义；预览和写回共用 `quoteFamily()`，避免两处行为不一致。
- **同名/本地化族名** → 以 `family` 的小写形式去重，可能合并本地化名称不同的同一字体；这是可接受的简化，搜索仍可用 `fullName`/`postscriptName` 找到。
- **选择替换现有回退栈** → 用户自定义的复杂栈会被覆盖；保留输入框可手动恢复，“系统默认”可一键回退，文档/提示中说明。
- **缓存过期** → 用户安装新字体后列表不会自动更新；提供“重新获取”，不监听系统字体变化。
- **弹窗并发** → 选择器打开时用户无法操作属性面板；关闭后未完成的请求用 closed 标志丢弃，避免写旧 DOM。

## Migration Plan

- 无数据迁移：`fontFamily` 仍是字符串，项目 JSON 版本不变；旧项目加载后与之前完全一致。
- 发布后如遇问题，可移除 `js/fontpicker.js` 的 script 引用并恢复字体字段为纯输入框；已保存的 `"Family", sans-serif` 仍是合法 CSS，不会破坏旧项目。
- 需要同步在 `DESIGN.md` 补充 Local Font Access 的本地/无网络说明，避免后续维护者误以为引入了网络字体。
