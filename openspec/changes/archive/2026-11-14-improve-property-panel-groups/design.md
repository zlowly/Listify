# Design

## Context

属性检查栏的内容由 `js/ui.js` 以字符串拼接 + `innerHTML` 整块重建：`renderPropertyPanel` → `renderPropertyPanelBody` 分发到 `renderCategoryProperties` / `renderTextProperties` / `renderImageProperties` / `renderBackgroundSetProperties` / `renderBackgroundImageProperties` / `renderPageProperties`。每个分区目前只是 `<div class="prop-group">` + `<div class="prop-group-title">`，样式仅有一条 `border-bottom: 1px dashed`（`style.css:442-458`），所以相邻子分区在视觉上属于同一片连续区域。字段由 `field` / `fieldPair` / `numberInput` / `selectInput` 构建，改值绑定走 `bind(id, event, handler)`，重渲染时由 `capturePanelFocus` / `restorePanelFocus`（`ui.js:701-731`）保住输入焦点。

关键约束：
- 「显示分类名」开关（`ui.js:1312-1316`，模型字段 `element.showTitle`）目前只调用 `L.app.changed({ property: false })` 重绘画布，**不重建面板**；自动折叠若依赖重渲染需要显式补一次。
- 全应用没有现成的折叠/`aria-expanded`/`<details>` 模式，需要新建，但可复用 `initPropTips`（`ui.js:276-311`）的面板级事件委托思路。
- `weightOptions()`（`ui.js:103-113`）已是唯一选项源，标签已含中文描述，只需去掉数值后缀；调用点只有 `categoryStyleFields`（`ui.js:1192`）与 `textStyleFields`（`ui.js:1373`）。
- `DESIGN.md` 约定：分组标题 12px / 700（`DESIGN.md:207`，当前 CSS 为 11px）；标签列 72px / 卡片 52px；1px 边框、无静止阴影、圆角只用 5/6/7/8/10；面板宽度 320px，窄窗 300px。
- 零构建、经典 `<script>`、`file://` 可开；属性面板不参与 PNG 导出，项目数据结构不变。

## Goals / Non-Goals

**Goals:**
- 用卡片边界与更强的标题层级把相邻分区、尤其两个子分区明确分开
- 每个分区可折叠，折叠状态在重渲染后不丢失，并按选中对象隔离
- 关闭「显示分类名」时自动折叠分类名子分区，重新开启时展开，且不触碰样式数据
- 「粗细」只显示中文描述、按内容收窄，并与「字号」同行
- 折叠不改变任何既有取值、绑定 id、画布与导出行为

**Non-Goals:**
- 不为「歌名子分区」新增隐藏开关（模型与渲染层都没有该语义）
- 折叠状态不写入项目文件或 localStorage；只在本页会话内按对象记忆
- 不重构属性面板的字符串拼接渲染方式，不引入组件库或模板引擎
- 不改动表格卡片、边距十字、数值定宽、帮助提示等既有面板约定

## Decisions

### D1: 分区改为卡片，标题条独立成带
- **做法**：`.prop-group` 从「虚线下分隔」改为 `border: 1px solid var(--line)`、`border-radius: 7px`、`background: #fff`、`padding: 0 10px 9px`、`margin-bottom: 8px`；`.prop-group-title` 提升为 12px / 700 / `var(--text)`，并以负外边距铺满卡片顶部形成标题条（`margin: 0 -10px 8px; padding: 6px 10px; background: var(--panel-2); border-bottom: 1px solid var(--line)`，上侧圆角 6px）。删除 `border-bottom: dashed` 与 `:last-child` 的虚线清除规则；面板滚动区内仍保留 `.property-panel` 左右 12px 内边距。
- **理由**：卡片边框天然把字段「框」在所属分区内，滚动时任意字段都有可见归属；标题条用底色差而非新颜色分层（遵循 `--panel-2` 纸白梯队与 Flat-By-Default），12px 主墨加粗与 11px 次级墨字段标签拉开层级，直接解决两个子分区看错位置的问题。
- **备选**：只把虚线换成实线并加大间距（区分度仍依赖一条线，滚动后标题离场即失效，放弃）；给两个子分区各配一种底色（引入第二种语义色、违反色板约束，放弃）；吸附式 sticky 标题（320px 面板内多个 sticky 条会互相遮挡，放弃）。

### D2: 统一 `propGroup` 构建函数，标题即折叠按钮
- **做法**：新增 `propGroup(key, titleHtml, bodyHtml, options)`，输出
  `<section class="prop-group" data-group="<key>">` +
  `<button type="button" class="prop-group-toggle" aria-expanded="true|false" aria-controls="prop-group-body-<key>">` +
  `<span class="prop-group-name">标题</span><span class="title-right">状态标签 / ?</span><span class="prop-group-chevron" aria-hidden="true"></span></button>` +
  `<div class="prop-group-body" id="prop-group-body-<key>">body</div>` +
  `</section>`。
  所有 `render*Properties` 中的 `'<div class="prop-group">' + '<div class="prop-group-title">…'` 逐处替换为 `propGroup(...)`；`key` 在同一面板内唯一（`block` / `title` / `song` / `tables` / `delete` / `page` / `size` / `margins` / `background` / `position` / `display` / `style` 等）。
- **理由**：折叠需要标题、状态标签、帮助图标、箭头共用一行；集中到一个函数后，五个面板的卡片结构与键名一致，后续新增分区自动获得折叠能力，也让 `.prop-group-title` 的旧拼写不再散落。
- **备选**：保留现有字符串片段、只给标题追加按钮（改动点分散在 20 余处，容易漏掉某个面板，放弃）。

### D3: 折叠状态存 `ui` 级 Map，按「选择 + 分区」记忆
- **做法**：`ui.groupCollapse = Object.create(null)`；键为 `<selectionKey>::<groupKey>`，`selectionKey` 形如 `el:<id>`、`page:<pageId>`、`bgset:<id>`、`bgimg:<setId>:<imageId>`。渲染时 `isCollapsed(key)` 查表，无记录时取默认：分类名子分区在 `element.showTitle === false` 时默认收起，其余全部分区默认展开。切换按钮点击时写表并就地切换 DOM（`section.classList.toggle('is-collapsed')`、更新 `aria-expanded`、`hidden` 切换 body），**不调用** `renderPropertyPanel`，因此不丢焦点、不跳滚动。
- **理由**：面板每次改值都可能重建 innerHTML，状态必须活在 DOM 之外；就地切换避免整块重建带来的滚动位置与焦点抖动，也避免折叠动作本身触发一次画布重绘。
- **备选**：把 `collapsed` 写进模型（会污染项目数据、触发自动保存与导出差异，放弃）；每次切换后整面板重渲染（简单但折叠时页面跳动，放弃）；只按 `groupKey` 全局记忆（会与「按对象默认收起」冲突，且 A 块的收起状态串到 B 块，放弃）。

### D4: 面板级事件委托处理折叠
- **做法**：在 `initPropTips` 同层新增一次 `ui.els.propertyPanel.addEventListener('click', …)`，用 `event.target.closest('.prop-group-toggle')` 命中按钮后取 `section.dataset.group` 与当前 `selectionKey` 切换状态。按钮是原生 `<button>`，Enter/Space 自带 click，无需额外键盘处理；`capturePanelFocus` 只处理 INPUT/TEXTAREA/SELECT，按钮聚焦不会干扰既有焦点恢复。
- **理由**：面板容器 `#property-panel` 在应用生命周期内不重建，委托监听只挂一次，天然跨 `innerHTML` 重建存活，与现有 help-tip 委托一致。
- **备选**：每次渲染后用 `bind` 给每个标题挂监听（随分区数量增长、且与其他 20 余个 `bind` 调用混杂，放弃）。

### D5: 显示开关驱动折叠用同一状态入口 + 就地同步
- **做法**：`prop-title-visible` 的 change 处理器在写入 `element.showTitle` 后调用 `setGroupCollapsed('title', !element.showTitle)`：更新状态表，再在现有 DOM 中找到 `[data-group="title"]` 就地收/展；随后照旧 `L.app.changed({ property: false })` 重绘画布。隐藏状态下的手动展开会覆盖该键为展开；重新开启时 `setGroupCollapsed('title', false)`。
- **理由**：不额外触发面板重建，复选框焦点与滚动位置保持不变；状态表与 DOM 同步只有一处逻辑，避免「状态已改、DOM 未动」的分裂。
- **备选**：change 后调用 `ui.renderPropertyPanel()`（可行但会重建整块面板，滚动位置在内容变短时可能跳动，且需处理按钮焦点，放弃）。

### D6: 粗细收窄为内容宽度并并入字号行
- **做法**：`weightOptions()` 标签改为 `细体 / 常规 / 中等 / 半粗 / 粗体 / 特粗 / 黑体`（值仍为 300–900）；`selectInput` 增加可选第 5 个参数 `extraClass`，粗细处传入 `select-compact`；CSS `.select.select-compact { width: auto; flex: 0 0 auto; min-width: 64px; }`。`categoryStyleFields` 与 `textStyleFields` 中原来的两行 `field('字号', …)` + `field('粗细', …)` 合并为
  `fieldPair('字号', numberInput(...) + '<span class="unit">px</span>', '粗细', selectInput(..., 'select-compact'))`。
- **理由**：`.field-row .field-b` 已是 `auto auto; justify-content: end`，下拉宽度由内容决定；去掉数值后缀后最长标签为两个汉字，64px 下限即可容纳文字与原生箭头。字号仍是 56px 定宽（`num-mid`），两侧合计约 154 + 91 + 8px 行距 ≈ 253px，小于 300px 窄栏的可用宽度 276px，不撑破面板。
- **备选**：用分段按钮替代下拉（7 档在 320px 内放不下，放弃）；把粗细做成图标（中文字重没有通用图标语义，放弃）；保留数值但隐藏（无障碍与读屏会读到冗余数字，放弃）。

### D7: 同步更新 DESIGN.md 的面板约定
- **做法**：实现阶段在 `DESIGN.md` 的 Property Inspector 段落补充：分组为卡片、标题条 12px 主墨、折叠按钮与箭头、折叠状态按对象记忆；粗细为纯中文描述并与字号同行。
- **理由**：`DESIGN.md` 是界面契约，属性面板是其签名组件；不更新会让后续改动重新引入虚线与全宽下拉。

## Risks / Trade-offs

- [卡片边框与内边距增加纵向占用，长面板滚动变多] → 卡片内行距维持 7px、标题条上下 6px、卡片间距 8px；折叠能力本身抵消长面板的浏览成本；必要时把「删除分类块」等单按钮分区保留为无边框行（由 `propGroup` 的 `plain` 选项支持）。
- [表格卡片嵌在分区卡片内形成双层边框] → 表格卡片改用 `background: var(--panel-2)`、`border-color: var(--line)`，外层卡片用 `#fff`；嵌套圆角 7/6 均在既有档位内，层级靠底色差表达而不是阴影。
- [`innerHTML` 重建后折叠状态与 DOM 不同步] → 渲染时统一由 `isCollapsed()` 输出 `hidden` 与 `aria-expanded`，切换只走 `setGroupCollapsed()`；状态表是唯一事实源，渲染不读 DOM。
- [按对象记忆导致状态表随编辑无限增长] → 键只含选择 id，量级等于本次会话编辑过的对象数；在 `ui.renderAll` 之外不做清理，页面关闭即释放，无持久化。
- [字号与粗细同处一行后在 300px 窄栏溢出] → `.field-b` 的标签 `white-space: nowrap`，下拉 `min-width: 64px`、字号固定 56px；按 D6 的宽度预算留 ≥20px 余量，实机在 300px 下验收。
- [「显示分类名」自动折叠与用户手动展开打架] → 自动折叠只在开关 change 时写一次状态；隐藏状态下用户展开后，后续任何重渲染都读状态表的展开值，除非再次切换开关。
- [折叠按钮抢走面板的 Tab 顺序] → 按钮参与 Tab 是预期行为（键盘可达），箭头与按钮文字同属一个焦点目标；`aria-controls` 关联 body id，读屏可定位内容。

## Migration Plan

纯前端静态站点，无数据迁移。改动集中在 `js/ui.js`、`style.css`、`index.html`（脚本版本号）与 `DESIGN.md`，一次提交完成；回滚即 revert。属性面板不进入 PNG 导出，导出结果与项目 JSON 均不受影响。

## Open Questions

（无）
