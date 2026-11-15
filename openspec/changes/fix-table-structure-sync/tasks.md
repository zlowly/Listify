# Tasks

## 1. 结构归一化纯逻辑（js/layout.js）

- [x] 1.1 从 `normalizeTables` 抽出幂等的溢出续表函数 `syncTableStructure(element, songCount)`（固定末表且总容量 < 歌名数时追加复制上一表属性、行数为 0 的续表），`normalizeTables` 改为调用它，随 `L.layout` 导出；验证：`node --test scripts/checks/*.test.js` 全绿（渲染期续表行为不变）。
- [x] 1.2 `setRows`/`setColumns` 增加 `songCount` 参数，应用新值后调用 `syncTableStructure`；验证：`node --test` 全绿。
- [x] 1.3 `removeTable` 增加 `songCount` 参数：删除末表且其承载歌名（`songCount > Σ 剩余表容量`）时把新末表行数置 0，否则保持现状；splice 后无条件调用 `syncTableStructure`，保留连续动态表防御分支；验证：`node --test` 全绿。
- [x] 1.4 在 `scripts/checks/layout.test.js` 新增回归用例：末表 0 行改固定且溢出 → `setRows` 后立即出现动态续表；减少末表列数致溢出 → 立即续表；删除承载歌名的末表 → 新末表 `rows === 0` 且 `layoutCategory` 渲染表格数减一、歌名全部保留；删除空末表 → 新末表行数不变；`syncTableStructure` 连续调用不重复追加；验证：`node --test scripts/checks/layout.test.js` 全绿。
- [x] 1.5 复查 `setRows`/`setColumns`/`removeTable` 的全部调用方（grep 确认仅 `js/ui-property-panel.js`，`js/dev-checks.js` 只用 `addTable`），更新 `js/dev-checks.js` 中受影响用例（如有）；验证：`node --test scripts/checks/*.test.js` 全绿且无遗留旧签名调用。

## 2. 属性栏同步（js/ui-property-panel.js）

- [x] 2.1 `bindTableCard` 增加 `category` 参数（由 `renderCategoryProperties` 透传），列数/行数 handler 计算 `songCount = (category && category.songs.length) || 0` 并传给 setter；验证：`node --test scripts/checks/*.test.js` 全绿（UI 代码不在 Node 覆盖内，以浏览器验证为准）。
- [x] 2.2 列数/行数 handler 在 setter 前后比较 `element.tables.length`：变化时就地刷新表格组（全部表格卡片 + “N 个”组头提示 + 添加表格按钮，复用 `capturePanelFocus`/`restorePanelFocus` 恢复焦点/光标/滚动位置，不触碰其余分组），不变时维持 `refreshTableCard`；“添加表格/删除表格”按钮动作同样改为表格组刷新；`remove` 动作传入 `songCount`；验证：浏览器手动验证——选中分类块，末表行数 0 改固定值（歌名溢出），属性栏表格组立即多出一张“末表”卡片且组头计数 +1；聚焦行数输入用原生上下箭头连续步进、跨过触发续表的那一步时焦点不丢失且步进不中断；删除承载歌名的末表，画布表格数立即减一、上一表行数显示 0、属性栏与画布一致；删除空末表，上一表行数保持不变。
- [x] 2.3 浏览器完整流程回归：拖入分类 → 增删表格、改列数/行数（含末表 0↔固定来回切换）、删表后撤销/重做（如有）、保存后重新加载草稿，表格结构各处一致；验证：`agent-browser` 或手动打开页面走一遍流程无异常，控制台无报错（`L.devChecks` 通过）。

## Workflow follow-up

- 评审通过后归档本变更（`openspec archive`），将 delta 合入主规格 `category-layout`。
