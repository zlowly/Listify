# Design

## Context

当前每个文字样式只有一个 `fontFamily` 字符串：

- `js/model.js` 的 `DEFAULT_FONT` 把中文字体排在前面，`fontString(style)` 直接用它拼 Canvas 的 `font`。
- `js/fontpicker.js` 选择字体后写入 `"Family", sans-serif`。
- `js/io.js` 的 `serializeStyle` 只白名单保存 `fontFamily` 等字段；加载时 `model.copyStyle` 会原样复制样式对象。
- `js/layout.js`、`js/render.js`、`js/export.js` 都通过 `model.fontString(style)` 使用同一个字体栈，因此只要 `fontFamily` 正确，测量、绘制、内联编辑和导出会自然一致。

CSS/Canvas 的字体选择是逐字形回退：每个字符使用栈中第一个包含该字形的字体。因此“西文在前、中文在后”的组合能让拉丁字符命中西文字体，中文缺字时落到中文字体。Local Font Access 只提供 family/fullName/postscriptName/style/weight 等元数据，没有字符覆盖信息，本变更接受这一 best-effort 边界。

参见 `proposal.md` 的动机和 `specs/font-selection/spec.md` 的行为要求。

## Goals / Non-Goals

**Goals:**

- 在分类名、歌名、自由文字三处提供西文/中文两个独立槽位，同时保留手动编辑完整字体栈。
- 以可预测的规则组合 `"西文字体", "中文字体", sans-serif`，并持久化可选的 `fontPair` 以恢复双槽位 UI。
- 调整默认字体为西文在前，且不静默改写旧项目。
- 让字体选择器按槽位预览，避免用中文示例误导西文槽位的选择。

**Non-Goals:**

- 不保证中文一定由中文字体渲染；不检测字体字形覆盖。
- 不实现 `@font-face` + `unicode-range`、逐段绘制、按脚本字号/字重或标点策略。
- 不为中文、日文、韩文分别提供槽位；中文槽位是一个 CJK 槽位。
- 不改变 PNG 导出格式、项目版本号或运行时依赖。

## Decisions

### 1. 用普通字体栈实现，不引入 `@font-face`

组合结果仍是普通 CSS 字体栈，Canvas、内联 textarea、PNG 导出和排版测量都继续走 `model.fontString(style)`。这是改动最小、字重最保真的方案：普通字体栈会使用字体家族真实的 Bold face，不需要处理动态 `@font-face` 的异步加载和 `local()` 字重匹配。

考虑过的替代方案：

- `@font-face` + `unicode-range`：能确定性分派、不受西文字体覆盖影响，但需要动态注册字体面、等待 `document.fonts.load()`、按 fullName 处理字重，复杂度明显更高。本变更先不做，未来可在不改变 `fontPair` 数据模型的前提下升级。
- 逐段绘制：最彻底，但要改 `wrapText`、测量、两端对齐和导出渲染，超出本变更范围。

### 2. 数据模型：`fontFamily` + 可选 `fontPair`

样式继续保存 `fontFamily`，并新增可选字段：

```js
{
  fontFamily: '"Inter", "Noto Sans SC", sans-serif',
  fontPair: { latin: 'Inter', cjk: 'Noto Sans SC' }
}
```

- `fontPair.latin` / `fontPair.cjk` 保存未加引号的字体族名；空值或缺失表示该槽位使用默认栈。
- `fontFamily` 始终是实际渲染字符串，也是旧版本和手输模式的兼容字段。
- 存在 `fontPair` 时，`fontFamily` 由组合函数生成，`fontPair` 是双槽位选择的真相；用户手动编辑 `fontFamily` 时删除 `fontPair`，改为手输栈模式。
- 加载时若 `fontPair` 有效，重新组合 `fontFamily`，修正可能过期的字符串；若没有 `fontPair`，完全保留已保存的 `fontFamily`。
- 字段是追加式的，不提升项目版本；旧版本忽略 `fontPair`，继续按 `fontFamily` 渲染。

考虑过的替代方案：

- 只存一个字符串并解析：无法可靠区分“配对的西文/中文”与用户随手写的栈，也容易在引号、转义和 generic family 上出错。
- 用结构化字段替换 `fontFamily`：最干净，但破坏旧项目加载和旧版本兼容，不值得。

### 3. 组合规则放在 `model` 层

新增 `model.composeFontFamily(pair)` 和 `model.normalizeStyle(style)`，并复用/提取现有的 `quoteFamily` 转义逻辑，避免 UI、持久化和渲染各自拼字符串。

组合规则：

```text
latin = pair.latin ? quote(pair.latin) : DEFAULT_LATIN_FONT
cjk   = pair.cjk   ? quote(pair.cjk)   : DEFAULT_CJK_FONT
fontFamily = latin + ', ' + cjk + ', sans-serif'
```

- 默认栈常量不带末尾的 `sans-serif`，只在最终组合时追加一次，避免重复 generic family。
- 两个槽位选到同一族时去重。
- `fontPair` 只有一个槽位时，另一槽位使用对应默认栈。
- 两个槽位都为空时删除 `fontPair`，使用 `DEFAULT_FONT`。
- 无效的 `fontPair`（不是对象、槽位不是字符串）在加载时丢弃，保留 `fontFamily`，不让坏数据影响渲染。

### 4. 默认字体拆成西文/中文两段

新增：

```text
DEFAULT_LATIN_FONT = "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans"
DEFAULT_CJK_FONT   = "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC",
                     "Source Han Sans SC", "WenQuanYi Micro Hei"
DEFAULT_FONT       = DEFAULT_LATIN_FONT + ", " + DEFAULT_CJK_FONT + ", sans-serif"
```

这些选择覆盖 Windows（Segoe UI / 微软雅黑）、macOS（Helvetica Neue / PingFang SC）和 Linux（Noto Sans / Liberation Sans / Noto CJK / 文泉驿）。不使用 `system-ui` 作为首选，因为它的解析可能受系统和区域设置影响，显式栈更可预测。

默认值只用于新建样式和“系统默认”恢复；加载旧项目时保留项目里的 `fontFamily`，不做静默迁移。

### 5. UI：保留一个完整栈输入框，增加两个槽位按钮

`ui.fontField(prefix, style)` 保持现有的完整字体栈输入框，在下方增加一行紧凑控件：

```text
字体
[ "Inter", "Noto Sans SC", sans-serif          ]  [选择]
西文：Inter        中文：Noto Sans SC
[选西文字体]  [选中文字体]        使用同一字体
```

- “选西文字体”/“选中文字体”分别以 `slot: 'latin' | 'cjk'` 打开选择器。
- 槽位提示行显示当前 `fontPair` 或“默认”，让用户知道两个按钮各自影响什么。
- 输入框仍可编辑；编辑时更新 `fontFamily`、删除 `fontPair` 并重绘。
- 不支持 Local Font Access 时，两个按钮禁用，输入框和槽位提示仍可用；这与现有降级行为一致。
- “使用同一字体”是可选快捷操作：清空 `fontPair` 并把当前输入框的栈作为完整手输栈。它保留旧行为的入口，不强制用户使用双槽位。

考虑过的替代方案：两个独立文本输入框分别编辑西文/中文。这样手动输入会变成两份，且难以表达“整条自定义栈”，所以选择“单栈输入 + 双选择按钮”。

### 6. 选择器按槽位工作

`fontPicker.open` 增加 `slot` 选项：

- 标题：`选择西文字体` / `选择中文字体`。
- 预览示例：西文槽位用 `Playlist 123 ABC`，中文槽位用 `歌单 中文歌曲`。中文预览不混入拉丁字符，否则看到的是该字体的拉丁字形，而不是中文覆盖情况。
- “系统默认”项：西文槽位预览/应用 `DEFAULT_LATIN_FONT`，中文槽位预览/应用 `DEFAULT_CJK_FONT`。选择默认时回传 `null`，由调用方清除对应 `fontPair` 槽位。
- 当前选中高亮：西文/中文槽位分别与 `fontPair` 对应值比较；槽位为空时高亮“系统默认”。
- 提示文案明确 best-effort：西文字体若包含中文字形，中文仍可能使用它；系统没有校验字形覆盖。不要出现“仅英文字体”或“已确保中文使用中文字体”的承诺。

字体族归一化、搜索、缓存、重新获取逻辑不变，两个槽位共用同一份会话缓存。

### 7. 渲染、排版、导出保持不变

`layout.measureText`、`render`、`export` 和内联 textarea 继续调用 `model.fontString(style)`；只要每次槽位变化都同步更新 `fontFamily`，它们无需修改。导出仍等待 `document.fonts.ready`，普通系统字体没有新增异步加载。

## Risks / Trade-offs

- **西文字体包含中文字形** → 中文可能仍由西文字体渲染，这是本方案的已知边界；通过选择器提示、槽位预览和文档说明降低误解；未来可升级到 `@font-face` + `unicode-range`。
- **标点/数字归属由覆盖决定** → 同一行里标点风格可能不一致；本变更不提供标点策略，记录为后续改进。
- **CJK 变体** → 一个中文槽位无法区分中文、日文、韩文的汉字字形；日文假名/韩文可能回退到系统字体。界面使用“中文/CJK”措辞，避免过度承诺。
- **合成粗体与光学大小** → 中文字体常缺 700 字重，浏览器会合成粗体；两种字体的 x-height/字面率也可能不同。接受现状，不在本变更中做按脚本字号/字重。
- **`fontPair` 与 `fontFamily` 漂移** → 只允许 `composeFontFamily` 生成 `fontFamily`；加载和每次槽位变化都重新组合；手输时删除 `fontPair`，避免两个真相。
- **“系统默认”语义混淆** → 明确它是“当前槽位恢复默认”，不是整条栈重置；槽位提示行显示“默认”。
- **旧项目默认值** → 修改 `DEFAULT_FONT` 不会改写旧项目；用户需要主动选择“系统默认”才会得到新默认栈，这是有意的非破坏性行为。
- **跨机器字体缺失** → 组合栈按 CSS 回退，保存的字符串不变；不静默替换项目数据。

## Migration Plan

1. 先加 `DEFAULT_LATIN_FONT` / `DEFAULT_CJK_FONT` / `composeFontFamily` / `normalizeStyle`，保持现有单栈行为不变。
2. `serializeStyle` 追加可选 `fontPair`；加载时调用 `normalizeStyle`。此步骤对没有 `fontPair` 的旧项目是空操作。
3. UI 增加两个槽位按钮和提示；选择器增加 `slot` 参数和槽位预览。
4. 更新默认 `DEFAULT_FONT` 为西文在前；只影响新样式和“系统默认”。
5. 手动验证旧项目加载、手输栈、保存回读、导出和跨浏览器降级。

回滚策略：旧版本忽略 `fontPair`，继续使用 `fontFamily`；新版本写入的 `fontFamily` 仍是合法 CSS 栈，因此回滚不会破坏项目文件。若需要完全回到旧行为，用户可手动编辑完整栈或选择“使用同一字体”。

## Open Questions

无。剩余问题（是否升级到 `@font-face` + `unicode-range`、是否增加按语言区分的槽位）属于后续独立变更，不影响本设计的规格和任务拆分。
