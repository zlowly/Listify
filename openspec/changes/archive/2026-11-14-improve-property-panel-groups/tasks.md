# Tasks

## 1. 分区卡片与统一构建函数

- [x] 1.1 在 `js/ui.js` 新增 `propGroup(key, titleHtml, bodyHtml, options)`，输出带 `data-group` 的 `<section class="prop-group">`、标题按钮（`aria-expanded` / `aria-controls` / 箭头）与 `prop-group-body`；验证：打开页面选中分类块，检查任一 `.prop-group` 内标题按钮、body 容器和 `data-group` 均存在。
- [x] 1.2 把 `renderPageProperties` / `renderCategoryProperties` / `renderTextProperties` / `renderImageProperties` / `renderBackgroundSetProperties` / `renderBackgroundImageProperties` 中所有手写的 `prop-group` + `prop-group-title` 片段替换为 `propGroup(...)`，键名在各自面板内唯一；验证：依次选中页面、分类块、自由文字、自由图片、背景集、背景图，每类面板的分区数与原面板一致且无空标题。
- [x] 1.3 在 `style.css` 中把 `.prop-group` 改为卡片（1px 实线边框、7px 圆角、白底、`padding: 0 10px 9px`、8px 间距），`.prop-group-title` 改为 12px/700/主墨并铺成标题条；删除原 `border-bottom: dashed` 与 `:last-child` 规则，表格卡片改用 `--panel-2` 底色避免双层白卡；验证：浏览器 320px 检查栏内滚动长面板，任意字段都被所属卡片边框包围，无横向滚动条。

## 2. 折叠交互与状态

- [x] 2.1 在 `js/ui.js` 增加 `ui.groupCollapse` 状态表、`selectionKey()`、`isCollapsed()`、`setGroupCollapsed()`，渲染时据此输出 `hidden` 与 `aria-expanded`；验证：默认除隐藏分类名的标题分区外全部展开，展开/收起时箭头方向与 `aria-expanded` 一致。
- [x] 2.2 在 `initPropTips` 同级给 `#property-panel` 挂一次 click 委托，命中 `.prop-group-toggle` 时就地切换 `is-collapsed`、body `hidden` 与 `aria-expanded`，不重建面板；验证：点击标题或聚焦后按 Enter/Space 均能收展，收展后滚动位置不跳、焦点仍在标题按钮。
- [x] 2.3 验证折叠状态按选中对象记忆：收起分类块 A 的「表格」分区 → 改 A 的字号触发面板重渲染后仍收起 → 选中分类块 B，其分区按 B 自己的记忆显示；验证：三个步骤逐一操作并观察，记录结果。
- [x] 2.4 修改 `prop-title-visible` 的事件处理：写入 `element.showTitle` 后调用 `setGroupCollapsed('title', !element.showTitle)` 就地同步，再执行原有 `L.app.changed({ property: false })`；隐藏状态下手动展开后重渲染保持展开，重新勾选时自动展开；验证：勾选/取消勾选后画布不绘制分类名、分区自动收/展，再展开并改颜色后画布仍不显示分类名。

## 3. 粗细选项与字号同行

- [x] 3.1 修改 `weightOptions()`，标签改为 `细体 / 常规 / 中等 / 半粗 / 粗体 / 特粗 / 黑体`，保留 300–900 值；验证：展开下拉只看到 7 个中文标签，无数字；选择「粗体」后 `element.songStyle.fontWeight === 700` 且画布立即变粗。
- [x] 3.2 给 `selectInput` 增加可选 `extraClass` 参数，新增 `.select.select-compact`（`width: auto; min-width: 64px`）；把 `categoryStyleFields` 与 `textStyleFields` 的字号、粗细两行合并为 `fieldPair('字号', 输入 + px, '粗细', 紧凑下拉)`；验证：分类名、歌名、自由文字三处均同行显示，字号在左、粗细在右，窗口缩到 900px（检查栏 300px）时行不换行、控件不被裁切。
- [x] 3.3 验证粗细持久化与旧项目兼容：选择「半粗」→ 保存项目 → 重新加载，确认下拉仍显示「半粗」且 `fontWeight` 为 600；加载改动前保存的项目，确认下拉按数值选中对应中文标签；验证：两次加载分别检查下拉文本与画布字重。

## 4. 文档与整体回归

- [x] 4.1 更新 `DESIGN.md` Property Inspector 段落：补充分组卡片与标题条、折叠按钮与按对象记忆的折叠、粗细纯中文描述并与字号同行；验证：通读该段落，描述与实现后的实际面板一致，未引入新的强调色或无依据的圆角档位。
- [x] 4.2 用 `agent-browser` 打开 `index.html` 做整体回归：六类属性面板的卡片与折叠、`?` 悬浮提示仍可用、数值框焦点与 Ctrl 步进不受影响、表格卡片与边距十字正常；验证：逐项操作并截图，控制台无报错。
- [x] 4.3 验证导出不受影响：收起任一分区后导出当前页 PNG，确认图片内容与折叠前完全一致，不包含任何面板控件；验证：对比导出文件尺寸与画面内容。

## Workflow follow-up

- 实现完成并通过项目评审后归档变更（`openspec archive improve-property-panel-groups`），随后确认 `openspec/specs/editor-shell/spec.md` 已包含新增需求。
