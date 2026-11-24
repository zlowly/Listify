# Tasks

## 1. 意图动作（js/app.js）

- [x] 1.1 新增 `autoLayoutCategory(element, options)`：校验 element 为分类块、取 `model.getCategory`、调用 `layout.arrangeTables`；成功时 `pushUndo('自动布局')`、替换 `element.tables`、`changed({ property: false })` 并返回 `{ ok: true, result }`；失败返回 `{ ok: false, reason }` 且不修改模型。验证：`node --check js/app.js`。
- [x] 1.2 从 `ctx.actions` 与 `L.app` 两处导出 `autoLayoutCategory`。验证：`grep` 确认两处导出、`node --check` 通过。

## 2. 属性面板入口（js/ui-property-panel.js）

- [x] 2.1 表格组 body 顶部新增自动布局行：最多行数（number，0 = 按页面自动，默认 0）、表格数（number，1–20，默认按歌名长度分布估算）、「自动布局」按钮与帮助提示。自动行数由面板内纯函数按标题实际换行与首表上下边距计算；默认表格数调用 `layout.estimateTableCount`，先排除极端长/短歌名，再按每表跨度最多 2 个中文字符估算；参数以 `WeakMap` 按 element 记住。验证：选中分类块后属性面板出现该区域。
- [x] 2.2 绑定点击：读取参数 → `ui.modal.confirm('自动布局', 说明保留字体/对齐/表格边距、清除列数/行数/列宽/多余表格、可撤销, { confirmLabel: '重新排版' })` → 确认后调用 `L.app.autoLayoutCategory`。验证：取消时模型不变。
- [x] 2.3 结果处理：失败 `ui.modal.alert`；超预算 `ui.toast('已按实际 N 行排版，超过可用的 M 行。')`；成功 `refreshTableGroup` 并 toast 表格数量。验证：失败、超预算、成功三类分支均有反馈且不抛错。
- [x] 2.4 `refreshTableGroup` 中补绑自动布局行，保证表格组刷新后按钮与参数仍可用。验证：自动布局后再改列数/行数，按钮不会失效。

## 3. 样式（style.css）

- [x] 3.1 为自动布局区加分隔线、参数行与按钮行样式，复用现有 `.field-row` / `.btn` / 设计变量，不引入新颜色体系。验证：320px 侧栏下两个输入与按钮不溢出。

## 4. 验证与收口

- [x] 4.1 `node --test scripts/checks/*.test.js` 全绿；`node --check js/app.js js/ui-property-panel.js js/layout.js` 通过。
- [x] 4.2 浏览器手测：选中分类块 → 改最多行数/表格数 → 自动布局 → 确认；检查行优先填充、表格数、列数自上而下不增加、字体/对齐/边距不变、单元格无溢出、属性栏表格数一致；Ctrl/Cmd+Z 恢复；取消与失败提示正常。
- [x] 4.3 确认新增分类块、拖入分类、导入歌单均不自动执行自动布局。

## 5. 行优先与表格数算法调整

- [x] 5.1 `layout.arrangeTables`：按视觉字宽升序、按剩余内容宽度逐段估算并切成 `tableCount` 张表，行优先填充；每段取最大可行列数且列数不增加；移除 150 首以上单表限制；每段容量与歌名数一致，避免补位溢出。验证：`node --test scripts/checks/layout.test.js`。
- [x] 5.2 属性面板参数改为“最多行数 0=自动”与“表格数 1–20”，移除密度；表格数默认调用 `layout.estimateTableCount`，`autoLayoutCategory` 传 `tableCount` 与自动行数。验证：浏览器按默认值生成多张表。
- [x] 5.3 回归覆盖：行优先顺序、表格数切分、列数不增加、150 首以上切分、末表无多余空列。验证：测试全绿。
- [x] 5.4 浏览器复测 20 首与 151 首分类：自动布局不溢出，151 首不再强制单表。
- [x] 5.5 新增 `layout.estimateTableCount(songs)`：四分位距剔除极端长/短歌名，按每表跨度 2 个中文字符估算，夹在 1–20；面板默认值使用该结果。验证：纯逻辑用例覆盖 1/2/5 张、极端长短、空分类。
- [x] 5.6 浏览器确认默认表格数随分类歌名长度分布变化，手动改值后仍可覆盖。

## Workflow follow-up

- 评审通过后归档本变更（`openspec archive`），将 delta 合入主规格 `category-layout`。