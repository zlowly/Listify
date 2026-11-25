# Design

## Context

背景层条目体系（`page.background.items`，`kind: 'image' | 'shape'`）已按"任意 kind"设计：删除、换序、复制背景、清空、全局覆盖只读、导出跳过均对条目通用。内容层插入入口在画布工具栏（`btn-add-text/image/shape`），背景层插入入口在属性面板背景分组（`prop-bg-add-image/shape`）。图形工具已有 armed 状态与 `shapeTool.target` 落点。见 proposal.md 的动机。

## Goals / Non-Goals

**Goals:**
- 工具栏成为插入唯一入口：内容层/背景层两组按钮（文字/图片/图形 × 2）。
- 背景文字条目（`kind: 'text'`，固定页面坐标矩形）贯通模型、渲染、编辑、导出、持久化。
- 落点由所点按钮直接决定，消除"切换落点"这一隐藏模式状态。

**Non-Goals:**
- 不改动背景图片的 fit 定位体系与画布拖动自动转 `none` 的规则。
- 不引入背景文字的样式继承（`findStyleSource` 仅用于内容层文字）。
- 不调整图层面板结构与换序交互（text 条目天然继承既有子行交互）。

## Decisions

1. **条目存储：`kind: 'text'` 固定坐标，不套 fit 模式**。图片的 fit 是页面相对定位，文字需要的是与图形一致的固定矩形；这样拖拽/微调/缩放手柄可复用背景图形那套命中与变换代码。备选方案"给 text 也做 fit"被否——语义不清且实现成本高。
2. **落点 = 按钮，不再有 target 切换**。`shapeTool.target` 在激活时由所点按钮写入；点击另一层按钮 = 改写 target + 转移 `aria-pressed`。复用 `toggleShapeTool(layer)` 现有逻辑，仅入口迁移。备选"分段落点切换控件"被否——多一层模式状态，与用户确认的 C′ 方案相悖。
3. **背景文字不进样式继承链**。`model.createTextElement` 的 `findStyleSource` 参数对背景文字固定传 `null`，默认样式用 `DEFAULT_TEXT_STYLE` 字面量，避免背景文字被最近的内容文字"传染"。
4. **资产引用判断改按 kind 白名单**。`assetIsReferenced`/`releaseUnusedAsset` 等处 `item.kind !== 'shape'` 的判断改为 `item.kind === 'image'`，避免未来新 kind 再次踩坑（text 条目无 `assetId`）。
5. **属性字段复用构造函数、落点走 intent 方法**。背景文字的属性面板字段与内容层文字共用 UI 构造代码，但写入必须经 `setBackgroundItemField` 类 intent 方法并调度重绘，遵守"UI 不直改模型"。
6. **双击编辑沿背景编辑态规则**：背景文字不抢内容层双击；编辑先在图层面板/画布选中背景条目（进入背景编辑态）后进行，与"正常命中永不选中背景"的既有规则一致。
7. **schema 兼容**：`project-schema` 校验接受 `kind: 'text'` 条目；`PROJECT_VERSION` 是否递增取决于校验严格度——读写双向兼容时不递增，仅做宽松读取（unknown kind 报错的现状需放开到白名单）。

## Risks / Trade-offs

- [工具栏宽度变 6 钮可能溢出] → 背景组用 icon-btn 小尺寸；组标签放 `aria-label`/`title`，非常驻文字；窄窗口下缩放组可换行（现有 flex 布局）。
- [背景文字被内容元素完全遮挡难以命中] → 依赖图层面板子行选中（既有路径），不强求画布直接命中；文档与提示说明先选背景。
- [MODIFIED 掉大块规范条款] → 落地时逐条核对 archive 后主 spec 的完整性，`openspec validate` 把关。
- [旧草稿 IndexedDB 里的项目无 text 条目] → 条目列表为空数组时行为不变；text 只随新操作产生，无需数据迁移。

## Migration Plan

无数据迁移。发布顺序：模型/IO → 渲染/导出 → 工具栏 UI → 属性面板入口移除 → 规范 archive。回滚即还原代码，schema 宽松读取保证新旧双向可开。

## Open Questions

（无——定位语义、继承、入口唯一性均已在本轮确认。）
