# Tasks

## 1. 解析层：重复不再失败

- [x] 1.1 在 `js/import.js` 的 `parseText` 中把重复分类名从 `errors` 改为合并记录：沿用现有“并入第一次出现分类”的语义，产出 `mergedCategories: [{ name, lines }]`；验证：`node --test scripts/checks/import.test.js` 中新增的“重复分类合并”用例通过，且 `samples/duplicate.txt` 不再返回 `ok:false`。
- [x] 1.2 把重复歌名从 `errors` 改为跳过：首行保留、后续行不写入 `songs`，产出 `skipped: [{ song, line, firstLine }]`，判定复用 `L.playlistCheck.key` 的 trim + 区分大小写口径；验证：新增用例覆盖同分类重复、跨分类重复、合并后重复、大小写不同不算重复。
- [x] 1.3 让 `parseText` 的返回结构保持 `ok/categories/errors/errorDetails/stats` 兼容，同时携带 `skipped` 与 `mergedCategories`；`stats` 仍按去重后结果计数；验证：现有解析用例（空分类名、空文件、`#` 开头限制、未分类）全部通过。

## 2. 导入计划：统一跳过记录与统计

- [x] 2.1 扩展 `planImport(project, parsedOrCategories, mode)`：数组输入按“无文件级重复”处理，对象输入把 `parsed.skipped` 归一化为 `{ song, source: 'file', line, firstLine }` 并合并进 `plan.skipped`；验证：原有以数组调用的计划测试不改断言即可通过。
- [x] 2.2 让 `planReplace` 返回文件级跳过项与 `mergedCategories`（不再固定 `skipped: []`），并让 `planAppend` 的项目级跳过项标记 `source: 'project'`、附带当前分类；验证：新增用例断言替换/追加两种计划的 `skipped` 来源、行号/分类字段与顺序。
- [x] 2.3 对齐 `stats.skippedSongs`：累计文件级与项目级跳过数，`addedSongs` 只统计真正写入的歌名；验证：替换与追加各一条统计断言通过，且 `applyImport` 仍只写入去重后的 `plan.categories`。

## 3. 确认流程与预览

- [x] 3.1 在 `js/app-import-export.js` 的预览渲染中统一四块内容：分类增删/歌名更新（替换）或并入统计（追加）、同名分类合并提示、跳过列表、提示语；替换模式也要显示跳过列表；验证：浏览器中用 `samples/duplicate.txt` 分别选择「替换全部」「追加到现有歌单」，两种预览都能看到被跳过的歌名。
- [x] 3.2 跳过列表按来源标注「文件内重复」（带原行号与首次出现行号）与「项目中已存在」（带当前分类）；验证：构造一个既含文件内重复又含项目已存在歌名的文件，确认两类条目分别出现且文案正确。
- [x] 3.3 完成摘要与零新增保持一致：toast 报出导入数量与跳过总数，追加模式零新增时禁用「继续导入」并提示总数、不产生撤销记录；验证：手动导入全重复文件观察按钮禁用与提示，再导入部分重复文件观察 toast 数量与 `Ctrl/Cmd + Z` 行为。

## 4. 示例与文档同步

- [x] 4.1 更新 `samples/duplicate.txt` 的用途说明（从“失败样例”改为“去重成功样例”），必要时补一个含项目级重复的手动验证样例；验证：直接用该文件导入能成功且跳过项与文件内容一致。
- [x] 4.2 更新 `README.md` 歌单格式说明与 `docs/歌单生成器需求.md` 中“分类和歌名不允许重名（报错提醒）”的表述，改为“文件内重复跳过并提示、同名分类合并”；验证：`grep -n "重名\|重复" README.md docs/歌单生成器需求.md` 不再出现“报错拒绝整次导入”的旧说法。

## 5. 集成验证

- [x] 5.1 运行 `node --test scripts/checks/*.test.js`，确认 import/playlist-check/model/io 等全部通过；记录退出码与失败摘要（如有）。
- [x] 5.2 在浏览器中走完整流程：导入 `samples/utf8.txt`、`samples/gbk.txt`、`samples/duplicate.txt`，分别验证替换与追加、撤销、分类块版面保留与左侧分类列表一致；确认无控制台错误。

## Workflow follow-up

- 代码改动完成后运行 `graphify update .` 保持知识图谱同步。
- 按项目评审要求完成后归档该变更，并验证归档结果。
