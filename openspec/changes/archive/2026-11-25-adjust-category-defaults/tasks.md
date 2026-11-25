# Tasks

## 1. 调整默认初始值

- [x] 1.1 在 `js/model.js` 把 `DEFAULT_TITLE_STYLE.fontSize` 从 44 改为 64、`DEFAULT_SONG_STYLE.fontSize` 从 28 改为 32；用 `rg -n "fontSize" js/model.js` 确认两个默认样式分别读到 64 与 32，且未误改其他样式。
- [x] 1.2 在 `js/model.js` 把 `createTable()` 的默认 `columns` 从 3 改为 4；用 `rg -n "columns: 4" js/model.js` 确认默认表格为 4 列，并确认 `layout.addTable` 仍复制上一表列数。
- [x] 1.3 在 `scripts/checks/model.test.js` 增加回归用例：无来源时 `createCategoryElement` 返回分类名 64、歌名 32、首表 4 列；同页有来源时继承来源样式而非默认值。运行 `node --test scripts/checks/model.test.js`，全部通过。

## 2. 回归与手工验证

- [x] 2.1 运行 `node --test scripts/checks/*.test.js`，确认纯逻辑回归全部通过。
- [x] 2.2 以 `file://` 打开页面手工验证：拖入第一个分类后分类名为 64px、歌名为 32px、首表为 4 列；再拖入第二个分类应继承第一个的样式；修改第一个分类字号后新建分类块仍继承修改后的值；加载已保存的旧项目时其样式与列数不变。

## Workflow follow-up

- 实现完成并通过验证后，按项目流程归档该 change。
