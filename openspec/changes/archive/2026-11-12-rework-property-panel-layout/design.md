# Design

## Context

属性面板完全由 `js/ui.js` 的字符串拼接渲染（`ui.renderPropertyPanel` 分发到 `renderPageProperties` / `renderCategoryProperties` / `renderTextProperties` / `renderImageProperties` / `renderBackgroundSetProperties` / `renderBackgroundImageProperties`），字段由 `field` / `fieldPair` / `numberInput` / `tableCard` 内的 `marginInput` 等构建函数生成，绑定走 `bind(id, event, handler)`（按 `getElementById`）。现状：`.field` 为 `72px + 1fr` 网格，`.input` 一律 `width:100%`；帮助文字是内联 `<p class="hint">`（10px）。画布侧已有成熟的浮动提示语言（DESIGN.md「画布浮动提示」：95% 深墨底、白字 12px、6px 圆角、小箭头），属性面板提示直接复用它。

硬约束：零构建、`file://` 可开、经典 `<script>`、无新增依赖；最小字号 11px 底线（提示正文 12px、标签 11px、单位 10px 为既有例外，沿用）；改动不得影响项目数据结构、导出与画布行为。

## Goals / Non-Goals

**Goals:**
- 帮助文字全部转为 `?` 图标 + 共享浮动提示，面板纵向空间释放给字段本身
- 数值输入按档位定宽（56/64/72px，含 16px 箭头区），右对齐等宽数字
- 主面板 72px / 卡片 52px 标签列的输入列纵向对齐
- 页面边距与表格边距的十字布局
- 键盘可达的提示（Tab 聚焦 `?`、Esc 关闭）

**Non-Goals:**
- 不改任何属性数据模型与绑定语义（id、事件、取值逻辑不变）
- 不改画布、图层栏、弹窗以外区域的提示行为；背景库弹窗内的帮助文字顺带改为同一 `?` 组件（同一渲染函数产出，成本为零）
- 不引入组件库、CSS 框架或新字体

## Decisions

### D1: 共享单例浮动提示，而不是每图标一个 tooltip 节点
- **做法**：面板内复用全局一个 `.prop-tip` 元素（`position:fixed`，`z-index` 高于检查栏）；`helpTip(文本)` 构建函数产出 12px 圆形 `<button class="help-tip">?</button>`（真按钮，天然可聚焦、Enter/Space 触发、Esc 可用），挂载 `mouseenter` / `focus` 显示、`mouseleave` / `blur` 隐藏、`Esc` 全局隐藏；显示时按 `getBoundingClientRect()` 定位在图标下方靠右（越界时翻转到上方或向左收），150ms 透明度过渡 + 4px 位移。
- **理由**：面板每次渲染重建 innerHTML，逐图标挂节点和监听会成倍放大 DOM 与事件量；单例 + 事件委托（在面板容器上按 `closest('.help-tip')` 分发）最省。文本存 `data-tip` 属性。
- **备选**：原生 `title` 属性（零代码但样式不可控、无键盘/焦点语义、延迟不可调，放弃）；每图标独立 tooltip（样式简单但重复节点多、定位逻辑分散，放弃）。

### D2: `?` 图标位置与间距
- **做法**：字段行级帮助挂在 `.field .control` 末尾（控件之后、行右缘之前）；分组级帮助挂在 `.prop-group-title` 右侧（替代现有标题内联 span，如「仅参考线」）。CSS 保证 `margin-left:10px`（距控件右缘 ≥10px），图标 `flex:0 0 12px`。
- **理由**：与布局稿一致——行右缘的 `?` 不占用标签列，也不会被整行控件（字体按钮、下拉框）挤压。

### D3: 数值宽度档位由 `numberInput` 内部推导
- **做法**：`numberInput(id, value, min, max, step, ...)` 依据 `max`（及 `min` 是否带符号）选择档位 class：`|max| ≥ 1000` 或 `min < 0` → `.num-wide`（72px）；`max ≤ 999` 且 `step` 为整数 → `.num-mid`（56px，三位）；`step < 1` 或 `max ≤ 99` → `.num-slim`（64px，两位/小数）。三档 class 统一：`width` 固定、`padding-right:22px`（7px 常规 + 16px 箭头区）、`text-align:right`、`font-variant-numeric:tabular-nums`、`-moz-appearance:textfield` 保留（Firefox 原生 spinner 可见，占宽已被 gutter 覆盖）。
- **理由**：调用点（十几个 `numberInput`）无需逐个传宽度，规则集中在一处，后续新增字段自动归档；档位值直接来自已审核布局稿。
- **备选**：每个调用点显式传宽（改动面大、易漏，放弃）；JS 运行时按值长动态改宽（输入过程中宽度跳动，体验差，放弃）。

### D4: 列节奏用既有网格微调，不引入新布局体系
- **做法**：`.field` 保持 `72px + minmax(0,1fr)`（已是现状，单值字段输入左缘天然对齐）；`fieldPair` 的 `.field-row` 保持两半结构，两半各自 `72px + 1fr`，因输入框自身定宽后，第一列输入左缘与单值字段一致，第二列输入左缘落在固定第二节奏（由 `.field-row` 的列宽差决定，天然稳定）；`tableCard` 内字段用 `.field-compact`（52px 标签列，现状 58px 收窄为 52px 以对齐布局稿）。删除 `.hint` 段落占位后，行距节奏统一为现有 `margin-bottom:7px`。
- **理由**：改动最小——对齐问题的大头是「输入框不定宽 + 帮助段落挤行」，定宽后现有网格即满足纵向对齐，无需重写布局。
- **备选**：全面板改 CSS Grid 双列模板（改动面大、与现有字符串拼接渲染冲突多，放弃）。

### D5: 边距十字用 3×3 网格
- **做法**：新增 `.margin-cross`（`display:grid`，3 列 × 3 行，列/行轨道均定宽：列 `64px 64px 64px`（卡片内 56px 档）、行 `27px 27px 27px`，间距 8px）；四个 `marginInput` 分别落 (2,1) 上、(1,2) 左、(3,2) 右、(2,3) 下，中心 (2,2) 放页面示意小图标（14×18 圆角描边矩形，纯 CSS/内联 SVG）。页面面板与 `tableCard` 的 `marginInput` 共用同一 class 结构，仅档位宽度不同。
- **理由**：方位即语义，与布局稿一致；grid 轨道定宽保证两个场景视觉一致且输入框仍吃到 D3 的定宽。
- **备选**：绝对定位摆十字（对齐脆弱、缩放不适配，放弃）。

### D6: 状态信息与帮助信息的划分沿用布局稿约定
- **做法**：`第 N 页 / 共 M 页` 中的 N/M、`N 页使用`、`当前图片：xxx`、`图片缺失或未选择`、`check.reason`、`0 行 = 动态行`（条件出现时）保持行内文本（pill 或 10px 元信息）；其余解释规则类文字（字体回退、动态行规则、边距相对关系、删除后果、图片绘制顺序、fit 模式行为、双击编辑、高度自适应、背景库定位等）全部进 `?` 提示。条件出现的「隐藏时样式保留」提示改为挂在「显示分类名」勾选行的 `?` 上，文案合并。
- **理由**：状态是「此刻的事实」，必须常驻；帮助是「规则说明」，可延迟获取。二者混进同一容器会造成信息噪音。

## Risks / Trade-offs

- [面板底部图标的提示溢出视口] → 定位时做边界检测，越界翻转到图标上方/左侧；面板滚动时若提示仍显示则隐藏。
- [档位推导误判边界值（如 max=1000 恰好四位）] → 推导以 `|max|` 位数和符号位计算并留一档余量；档位是视觉上限，输入值超出档位时仍可输入完整数值（`width` 只约束框宽，不截断值）。
- [Firefox 的 number spinner 始终可见，22px 右内边距在小档（56px）下偏紧] → 56px 档只用于三位整数（21px 字宽 + 14px 常规 padding + 2px 边框 + 16px gutter ≈ 53px，留 3px 余量）；实测不足时该档整体 +4px。
- [innerHTML 重建会销毁正在显示的提示] → 显示态挂在单例上而非被重建的节点上；面板重渲染时先隐藏提示再重建。
- [Esc 与「退出选择/背景编辑」的全局 Esc 行为冲突] → 面板提示的 Esc 处理在捕获阶段 `stopPropagation`，仅当提示可见时拦截，不改变既有 Esc 语义。

## Migration Plan

纯 UI 静态站点，无数据迁移：改动集中于 `js/ui.js` 与 `style.css`，一次提交完成；回滚即 revert 该提交。`docs/property-panel-mockup.svg` 保留为布局基线（不删除），后续面板改动可对照。

## Open Questions

（无——布局稿已按像素审核通过，实现层决策均已在上文给出取舍。）
