# Tasks

## 1. 布局算法与回归（js/layout.js、scripts/checks/layout.test.js）

- [x] 1.1 在 `arrangeTables` 中把下一张表的列数上限改为上一张成功表的 `columns - 1`，首表仍从 `maxColumns` 开始；末表同样使用严格上限，保证输出列数自上而下严格递减。验证：现有布局用例仍通过，新增断言中没有相邻表列数相等。
- [x] 1.2 把请求表格数收敛为 `min(请求值, 单表最大列数, 歌名数)`，从该值递减到 1 重试完整切分；首次成功即采用，全部失败返回 `null`。成功结果增加 `requestedTableCount` 与 `tableCountReduced`，`tableCount` 继续表示实际数量。验证：请求 20 张但只有 5 首歌时返回不超过 5 张且标记减少；请求数量可行时不标记减少。
- [x] 1.3 在返回前校验所有表格列数互不相同且严格递减；校验失败时按该次尝试失败处理并继续减少表格数。验证：构造重复列数场景时结果仍满足唯一性。
- [x] 1.4 `estimateTableCount` 在现有跨度估算后把结果夹在 `1..min(歌名数, ARRANGE_MAX_COLUMNS)`。验证：跨度估算会超过 8 张时调用结果为 8；歌名少于 8 首时不超过歌名数；空分类仍返回 1。
- [x] 1.5 更新既有 `arrangeTables` 测试：把“列数不增加”断言改为严格递减，并补充“任意两张表列数不同”的检查。验证：`node --test scripts/checks/layout.test.js` 全绿。
- [x] 1.6 新增重复列数回归用例：20 首/960 宽/3 表、18 首/960 宽/2 表、100 首/960 宽/5 表，断言所有列数唯一、严格递减、全部歌名按行优先顺序保留且单元格不溢出。验证：同一命令全绿，且用例在旧算法上会失败。
- [x] 1.7 新增请求数量不可行用例：5 首歌请求 20 张、9+ 张请求超过 8 张，断言实际表格数减少、`tableCountReduced` 为真、所有列数唯一。验证：`node --test scripts/checks/layout.test.js` 全绿。

## 2. 属性面板反馈（js/ui-property-panel.js）

- [x] 2.1 把参数标签从「表格数」改为「最大表格数」，并更新自动布局帮助提示：说明各表列数互不相同且自上而下严格递减，输入的最大表格数无法满足唯一性时系统会自动减少实际表格数。验证：选中分类块后标签、提示文字与规格一致，且不出现“列数不增加”的旧说法。
- [x] 2.2 「最多行数」与「最大表格数」改为上下两行；第二行用 flex 容器让「自动布局」按钮与帮助图标跟在「最大表格数」输入之后，空位不足时整体换行。验证：在 300px 与 320px 检查栏宽下，按钮与输入同排且不溢出；窗口更窄时按钮换行不挤压输入。
- [x] 2.3 成功提示改为消息片段合成：基础消息为实际表格数；`tableCountReduced` 为真时追加“为保证各表列数唯一，已从输入的最大表格数 N 张减少”；`overBudget` 为真时追加原有行数超预算信息；最后只调用一次 `ui.toast`。验证：三种组合（正常、减少、减少且超预算）均能看到对应信息。
- [x] 2.4 确认框与失败提示保持现有语义：成功时刷新表格组，失败时 `ui.modal.alert` 且不修改模型。验证：取消、失败、成功三条路径均不抛错；`node --check js/ui-property-panel.js` 通过。

## 3. 集成验证

- [x] 3.1 运行 `node --test scripts/checks/*.test.js`，确认全部通过；运行 `for f in js/layout.js js/ui-property-panel.js; do node --check "$f"; done`，确认语法检查通过。
- [x] 3.2 浏览器手测：对 20 首歌分类执行自动布局 3 张表，确认列数严格递减且无重复；请求 20 张表且歌名较少时，确认实际张数减少并出现提示；Ctrl/Cmd+Z 恢复自动布局前的表格结构。
- [x] 3.3 浏览器手测：确认字体、对齐、表格边距保持不变，歌名全部保留且无溢出红格；手工增删表格或修改列数时仍允许重复列数（唯一性只约束自动布局输出）。
- [x] 3.4 确认项目保存/加载后表格结构正常，自动布局参数与 `requestedTableCount`/`tableCountReduced` 未写入项目文件（检查导出 JSON）。

## Workflow follow-up

- 评审通过后运行 `openspec archive enforce-unique-auto-layout-columns`，把 delta 合入主规格 `openspec/specs/category-layout/spec.md`。
- 归档后重新运行 `node --test scripts/checks/*.test.js`，确认主规格与实现一致。
