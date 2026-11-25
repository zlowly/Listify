# Tasks

## 1. 聚焦状态与面板绑定

- [x] 1.1 在 `js/app.js` 的 state 中新增 `focusTableIndex: null`，并提供设置/清除入口（含触发 `changed({ property: false, layers: ['chrome'] })` 的轻量重绘）；验证：控制台手工调用后 chrome 层重绘无报错。
- [x] 1.2 在 `js/ui-property-panel.js` 的「表格」分组容器上以 `focusin`/`focusout` 事件委托读取 `.table-card` 的 `data-table-index`：聚焦写入 `focusTableIndex`，焦点仍在同一卡片内（`relatedTarget` 判断）时不清除，离开或重建面板时清除；验证：浏览器中聚焦"表格 2"卡片的列数输入框，`state.focusTableIndex` 为 1，移开焦点后回到 null。

## 2. 画布绘制（chrome 层）

- [x] 2.1 在 `js/app-chrome.js` 的 `drawChrome` 中新增聚焦高亮绘制：选中分类块且 `focusTableIndex` 命中（含边界检查）时，从 `layout.layoutCategory` 结果取该表渲染盒，画 1.5px `#2563eb` 实线外框 + `rgba(37, 99, 235, 0.08)` 填充；验证：聚焦"表格 2"卡片时画布第 2 张表出现蓝框淡蓝底，焦点离开即消失。
- [x] 2.2 在 `js/app-chrome.js` 新增表格序号角标绘制：选中分类块时按表格顺序在每张表渲染盒左上角外侧画约 14px 工坊蓝底白字圆角序号（1、2、3……），与 `drawTableDividers` 同一触发条件；验证：选中含 3 张表的分类块，画布依次显示 1/2/3 角标，与属性卡片编号一致。
- [x] 2.3 处理状态失效：表格删除使索引越界或结构变更重排时，绘制前做边界检查（不画）、并在删表后清除 `focusTableIndex`；验证：删除聚焦中的表格后无残留描边/填充，不报错。

## 3. 行为核对与回归

- [x] 3.1 验证重排跟随：焦点仍在"表格 2"卡片时修改表格 1 的列数触发重新分配，高亮跟随第 2 张表的新几何位置（对照 specs 场景"结构变更后跟随"）。
- [x] 3.2 验证导出隔离：存在序号角标与聚焦高亮时用 `agent-browser` 或手工执行"导出本页 PNG"，确认导出图像中两者均不出现；同时运行 `node --test scripts/checks/*.test.js` 确认零依赖回归套件全部通过。
