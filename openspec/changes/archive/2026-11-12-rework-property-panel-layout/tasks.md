# Tasks

## 1. 共享浮动提示组件

- [x] 1.1 在 `js/ui.js` 新增全局单例 `.prop-tip` 元素与显隐/定位逻辑（图标下方靠右定位、视口越界翻转到上方或左侧、`mouseenter`/`focus` 显示、`mouseleave`/`blur` 隐藏、Esc 在捕获阶段关闭且仅提示可见时 `stopPropagation`、面板 innerHTML 重建前先隐藏），并新增 `helpTip(文本)` 构建函数（12px 圆形 `<button class="help-tip">?</button>`，文本存 `data-tip`，事件在面板容器上按 `closest('.help-tip')` 委托分发）；用 agent-browser 打开页面悬停/Tab 聚焦/按 Esc 验证提示出现、消失与键盘可达
- [x] 1.2 在 `style.css` 新增 `.help-tip`（12px 圆形、淡墨描边、`margin-left:10px`、hover/focus 变蓝底白字）与 `.prop-tip`（95% 深墨 `#111827` 底、白字 12px、6px 圆角、小箭头、150ms 淡入 + 4px 位移、z-index 高于检查栏）样式；浏览器中目检样式与 `docs/property-panel-mockup.svg` 标注 4 一致

## 2. 数值输入定宽

- [x] 2.1 在 `style.css` 新增三档宽度 class（`.num-mid` 56px / `.num-slim` 64px / `.num-wide` 72px，统一 `padding-right:22px`、`text-align:right`、`font-variant-numeric:tabular-nums`）；浏览器中确认三档框宽与布局稿标注 2 一致且箭头区可见
- [x] 2.2 修改 `js/ui.js` 的 `numberInput`：按 `max`/`min`/`step` 推导档位（`|max|≥1000` 或 `min<0` → wide；`step<1` 或 `max≤99` → slim；其余整数 → mid）并挂对应 class；`node --check js/ui.js` 通过，浏览器中逐面板核对：位置 X/Y=72px 档、字号=56px 档、行距/列数=64px 档、边距=72px 档，数值右对齐且完整可见

## 3. 输入列纵向对齐

- [x] 3.1 在 `style.css` 将 `.field-compact` 标签列由 58px 收窄为 52px（卡片内节奏），确认 `.field`（72px 标签列）与 `.field-row` 两半结构在输入定宽后左缘落在同一列节奏；浏览器截图目检分类块属性中位置 X 与宽度输入框左缘同列、位置 Y 落第二列，表格卡片内字段 52px 列对齐

## 4. 边距十字布局

- [x] 4.1 在 `style.css` 新增 `.margin-cross`（3 列 × 3 行网格，轨道 27px 高、列宽跟随数值档位、间距 8px）与中心页面示意图标样式（14×18 圆角描边矩形）；浏览器中目检与布局稿十字形态一致
- [x] 4.2 修改 `js/ui.js`：`renderPageProperties` 的页面边距与 `tableCard` 的边距改用 `.margin-cross` 结构（上 (2,1)、左 (1,2)、右 (3,2)、下 (2,3)，中心放示意图标），保留各 `margin-<side>` 数据字段与取值绑定；浏览器中在未选中（页面面板）与选中分类块（表格卡片）两种状态下验证十字呈现、四个方向取值与写入正确

## 5. 帮助文字迁移到 `?` 提示

- [x] 5.1 迁移页面与背景相关渲染（`renderPageProperties`、`renderBackgroundSetProperties`、`renderBackgroundImageProperties`、背景库弹窗）：帮助类 `.hint` 段落与标题内联帮助（如「仅参考线」「图片按列表顺序从底到顶绘制」等）改为 `helpTip`，状态类信息（第 N 页/共 M 页、N 页使用、当前图片名、图片缺失或未选择、删除原因）保持行内；浏览器逐状态核对提示文案与迁移前逐字一致、状态信息仍常驻
- [x] 5.2 迁移分类块与内容渲染（`fontListField`、`tableCard`、`renderCategoryProperties`、`renderTextProperties`、`renderImageProperties`）：字体回退、动态行规则、边距相对关系、删除后果、「0 行 = 动态行」、双击编辑、高度自适应等帮助改为 `helpTip`；「隐藏时样式保留」条件提示合并进「显示分类名」勾选行的 `?`（文案合并后常驻可查）；`grep 'class="hint"' js/ui.js` 结果仅剩状态类文本，浏览器逐选择态（分类块/自由文字/自由图片）核对布局与布局稿一致、`?` 距控件右缘 ≥10px

## 6. 集成验证与文档

- [x] 6.1 全量冒烟：`node --check` 全部 js 文件通过；agent-browser 依次验证——各选择态布局无错位、Esc 仍按原语义退出选择/背景编辑（提示可见时只关提示）、`Ctrl+V` 粘贴拦截不受影响、导出 PNG 结果与改动前一致（属性面板不进入导出）；任一项不符则回到对应组修复
- [x] 6.2 在 `DESIGN.md` 属性面板相关小节补记新约定（帮助 `?` 图标 + 共享浮动提示、数值三档宽度 56/64/72 含 16px 箭头区、72/52px 标签列节奏、边距十字），与本次实现逐条对得上

## Workflow follow-up

- 实现与验证全部完成后运行 `openspec validate --change "rework-property-panel-layout"`（或 `openspec validate`）确认无警告。
- 项目评审要求满足后归档该 change（`openspec archive`），归档时 delta 会并入 `openspec/specs/editor-shell/spec.md`。
