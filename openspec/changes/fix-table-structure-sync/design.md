# Design

## Context

- `layout.layoutCategory` 在每次排版开头调用 `layout.normalizeTables(element, songCount)`，后者会把“固定末表容量不足 → 追加行数为 0 的续表”作为**渲染副作用**直接改动 `element.tables`（见 `js/layout.js` 的 `normalizeTables` 末尾分支）。
- 属性面板的结构性字段（列数/行数）走 `L.app.changed({ property: false })` + `refreshTableCard`：前者只排程画布重绘、不重渲属性栏，后者只替换单张表格卡片（含表格个数提示 “N 个” 的组头不更新）。渲染期的模型突变因此对属性栏不可见，直到下一次选择变化触发整栏重渲。
- `removeTable` 只做 splice 和一个“连续两个动态表”的防御修正；删除承载歌名的末表后，溢出会由渲染期续表“复活”成一张属性相同的新表，页面观感是删除无效。
- 调用面已核实：`setRows`/`setColumns`/`removeTable` 仅被 `js/ui-property-panel.js` 调用（grep 确认）；`addTable` 还被 `js/dev-checks.js` 调用（签名不受影响）。Node 回归套件（`scripts/checks/layout.test.js`）只使用 `layoutCategory`/`addTable` 等纯逻辑入口。
- 性能约束（既有，MUST NOT 回退）：主规格 `editor-shell`「面板输入就地提交」要求数值/滑条类输入提交时 MUST NOT 重建整个属性面板、MUST NOT 改变正在操作输入的焦点状态，连续步进 MUST NOT 中断，并使面板结构改变的改值（明确列举“表格行列数”“表格结构切换”）SHALL 只更新受影响区域；性能变更（`2026-11-14-optimize-redraw-performance`）引入 rAF 合帧重绘、布局签名缓存（`tablesSignature` 覆盖表格数量/行列/宽度等全部结构字段）与分层画布，`changed()` 走 `layout.invalidate()` + 合帧。
- 约束（AGENTS.md）：零构建、无新增依赖、纯逻辑必须可被 Node 回归覆盖；模块依赖方向 `layout` 不依赖 `ui`，因此结构归一化必须留在 `layout.js`，面板只消费结果。

## Goals / Non-Goals

**Goals:**

- 表格结构（表格数量、动态/固定状态）在编辑动作（改行数、改列数、删表格）完成时即确定，渲染期不再发生用户可感知的结构突变。
- 删除承载歌名的末表时，上一表自动转为动态行吸收歌名（用户期望行为）。
- 属性栏在任何结构变更后立即与画布一致，不依赖重新点选。
- 全部新语义为纯逻辑，可在 `node --test` 下回归。

**Non-Goals:**

- 不改变歌单内容编辑（增删歌名）触发溢出的渲染期兜底续表（保持现有行为）。
- 不改变表格布局算法（列宽、填充、行高、占位行、边距）本身。
- 不引入新的持久化字段或项目格式版本。

## Decisions

1. **抽出幂等的结构归一化函数 `syncTableStructure(element, songCount)`（内部命名，随 `L.layout` 导出）**
   把 `normalizeTables` 末尾的“固定末表且总容量 < 歌名数 → 追加复制上一表属性、行数为 0 的续表”分支原样抽出为独立函数。`normalizeTables` 继续调用它（渲染期兜底：导入/旧项目、歌单变化触发的溢出），因此行为完全向后兼容；函数幂等——末表已为动态表时是 no-op，不会重复追加。
   - 备选：在面板侧重绘后读回 `element.tables` 再补渲。否决：治标不治本，模型状态在“动作返回后、重绘完成前”仍是中间态，撤销/草稿快照可能捕获到不一致结构。

2. **`setRows`/`setColumns`/`removeTable` 增加 `songCount` 参数，动作内同步调用 `syncTableStructure`**
   面板从 `renderCategoryProperties` 作用域的 `category` 取 `(category && category.songs.length) || 0` 传入（`bindTableCard` 增加 `category` 参数透传）。应用新值后调用 sync，使 `element.tables` 在 `changed()` 排程重绘之前即为最终形态。
   - 备选：保持 setter 无参、由面板自行调用导出的 sync。否决：把“结构不变量”的维护点分散到 UI 层，未来新增调用方（如键盘快捷键）容易漏调；集中在 mutation 函数与 `addTable` 的既有风格一致。

3. **`removeTable` 末表吸收规则：仅当被删表承载歌名时把新末表转为动态行**
   被删末表承载的歌名数 = `max(0, songCount − Σ(剩余各表 columns × rows))`（其余表此时必为固定表，容量有定义）。> 0 时令新末表 `rows = 0`；否则保持现状（直接移除，上一表维持固定行数）。splice 后无条件跑一次 `syncTableStructure`（覆盖删中间表后遗留固定末表溢出的旧数据情形）；保留现有“连续动态表防御”分支。
   - 备选：删除末表时无条件把上一表转为动态行。否决：稀疏固定表（行数大于实际所需）会因此收缩行数、改变页面高度与导出高度，空表删除场景也会从“N 行空格”变为占位行，超出用户诉求且引入可见的副作用。

4. **面板：结构变化 → 表格组就地刷新（只更新受影响区域）；纯值变化 → 维持单卡片局部刷新**
   列数/行数 handler 在调用 setter 前后比较 `element.tables.length`：变化则就地刷新整个表格组（全部表格卡片 + “＋ 添加表格”按钮 + “N 个”组头提示）并重新绑定，否则维持 `refreshTableCard`；“添加表格/删除表格”按钮动作同样改为表格组刷新（主规格“表格结构切换 SHALL 只更新受影响区域”）。复用既有 `capturePanelFocus`/`restorePanelFocus` 恢复被操作输入的焦点与光标（输入 id `prop-table-{index}-rows` 稳定：续表追加在末尾，删除走按钮动作），面板其余分组不触碰、滚动位置不变。
   - 备选 A（初稿）：结构变化时整栏 `ui.renderPropertyPanel()`。否决：违反性能变更确立的 `editor-shell`「面板输入就地提交」需求——行数输入是数值输入，原生上下箭头每步触发一次 change，触发续表的那一步会重建整面板，MUST NOT 重建整个面板、MUST NOT 中断连续步进。
   - 备选 B：扩展 `refreshTableCard` 做单卡片插入/移除并就地补组头计数。否决：组头计数与添加按钮不在任何单张卡片内，逐处补丁比整组 innerHTML 替换更复杂；组级替换是现有单卡片机制的自然推广，且正好对应“只更新受影响区域”。

5. **不改 `normalizeTables` 的其余修正（非末表动态表冻结为 1、列数/行数钳制）**
   它们是防御性数据修正，保留在渲染期即可，不产生用户可感知的结构突变。

## Risks / Trade-offs

- [setter 签名变化遗漏调用方] → 已 grep 确认调用方仅 `ui-property-panel.js`（另有 `dev-checks.js` 用 `addTable`，签名不变）；Node 测试不直接调 setter。任务清单中设专门一步复查引用。
- [布局缓存/合帧回退] → `tablesSignature` 已覆盖全部结构字段，结构变化天然改签名、使缓存失效；setter 在 `changed()`（`invalidate()` + 合帧重绘）之前完成结构变更，帧开始时的模型即最终形态，帧令牌内共享布局的消费方（绘制/溢出/选择框/分隔线）看到的是同一稳定结构——对性能变更的帧内一致性保证是收紧而非放松。
- [撤销/草稿快照] → 动作内同步完成结构变更后，`changed()` 之后的快照捕获的是最终结构，比现状（快照可能含中间态）更一致；不改变撤销机制本身。
- [歌单编辑触发的渲染期续表仍会使属性栏滞后] → 属既有行为、非本次诉求（Non-Goal）；sync 幂等保证两条路径结果相同，后续可单独改进。
- [category 缺失时 songCount 为 0] → sync 不追加，渲染期兜底仍会按真实歌名数修正，行为与现状一致。

## Migration Plan

无数据迁移。存量项目加载路径不变；历史遗留的“固定末表 + 溢出”数据由渲染期 `normalizeTables` 按原规则修正。回滚即还原 `js/layout.js` 与 `js/ui-property-panel.js` 的改动，无持久化影响。
