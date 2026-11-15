# Tasks

## 1. 共享查重模块

- [x] 1.1 新建 `js/playlist-check.js`，实现 `key`、`index`、`analyze`、`cellMessage`、`groupMessage`、`summary`、`HINT`，并写 `scripts/checks/playlist-check.test.js` 的基础用例（trim 键、索引形状、两项重复分组、无重复返回空）；运行 `node --test scripts/checks/playlist-check.test.js` 通过。
- [x] 1.2 补充边界用例：三项及以上重复、大小写不同不算重复、每个重复格指向同组另一个格、`summary` 与 `HINT` 文案、空分类数组；运行 `node --test scripts/checks/playlist-check.test.js` 通过。
- [x] 1.3 在 `index.html` 的 `js/model.js` 之后、`js/layout.js` 之前加入 `js/playlist-check.js` 的经典 `defer` 脚本；用 loader 加载后断言 `L.playlistCheck` 可用，并运行 `node --test scripts/checks/*.test.js` 通过。
- [x] 1.4 在 `scripts/README.md` 的回归检查列表中加入 `playlist-check.test.js` 的覆盖说明；确认文档中的 `node --test scripts/checks/*.test.js` 可照抄运行。

## 2. 导入计划与应用

- [x] 2.1 在 `js/import.js` 增加 `planImport(project, categories, mode)` 的替换分支（复用 `reconcile` 与 `countSongChanges`），并让 `applyImport` 接受计划、按替换模式删除名称不在新集合内的分类块；新建 `scripts/checks/import.test.js` 覆盖同名分类、分类消失、歌名更新计数，运行 `node --test scripts/checks/import.test.js` 通过。
- [x] 2.2 实现追加分支：用 `L.playlistCheck.index(project.playlist.categories)` 按文件分类顺序与歌名顺序合并，输出 `mergedCategories`、`skipped`、`addedCategoryNames` 与统计；测试覆盖并集、追加顺序、跨分类跳过并记录所在分类、新分类 0 首仍创建、`未分类` 合并、大小写敏感，运行同一测试文件通过。
- [x] 2.3 让 `applyImport` 在追加模式下永不删除分类块，在替换模式下保持现有删除行为；测试构造带 `page.elements` 的项目，断言两种模式的元素增删结果，运行 `node --test scripts/checks/import.test.js` 通过。
- [x] 2.4 在 `scripts/README.md` 的回归检查列表中加入 `import.test.js` 的覆盖说明；确认条目与实际文件名一致。

## 3. 导入交互

- [x] 3.1 改造 `js/app-import-export.js` 的确认流程：项目已有分类时显示“替换全部 / 追加到现有歌单”单选项（默认替换），切换时重算计划与预览；项目为空时直接按替换应用。浏览器验证：先向空项目导入（无选择框），再导入第二份文件（有选择框且默认替换），取消后数据不变。
- [x] 3.2 实现追加预览（新增分类未放置、并入分类及新增/跳过数、无变化分类、跳过歌名及所在分类、改名提示）与追加 toast；零新增时禁用继续并提示“没有新增内容”，不写撤销记录。浏览器验证：导入含 1 首新歌和 1 首重复的文件，再导入全重复文件。
- [x] 3.3 回归编码与错误路径：确认 GB18030 文件自动解码并导入；无法识别的字节进入编码选择框；文件内重复名进入“导入失败”弹窗（文案与改动前一致）；确认只有用户确认继续后才 `pushUndo('导入歌单')`。

## 4. 歌单编辑器接入

- [x] 4.1 在 `js/ui-playlist-editor.js` 用 `L.playlistCheck.analyze` 替换本地 `songPositions` 重复扫描，保留空值与 `#` 开头校验，重复格改用 `cellMessage` 指明分类与序号；浏览器验证：把某格改成另一分类已有歌名，提示包含该分类与位置且“应用”禁用。
- [x] 4.2 在编辑器页脚常驻重复摘要与 `HINT`，复用分析结果计算待修正数量；浏览器验证：制造两组跨分类重复，页脚显示数量、冲突歌名与所在分类，修正后摘要消失。
- [x] 4.3 保留“应用”处理器的防御性复检，确认交换两首歌名的临时重复仍可继续编辑；浏览器验证：先制造重复、再改另一格消除，应用成功且只产生一步撤销。

## 5. 集成验证

- [x] 5.1 运行 `node --test scripts/checks/*.test.js`，确认全部通过且没有跳过非环境相关用例。
- [x] 5.2 在浏览器走完整矩阵：空项目导入、替换导入保留版面、部分重叠追加、全重复追加、编辑器跨分类重复；确认无控制台错误、追加不删块、撤销符合预期。
- [x] 5.3 运行 `./build.sh`，确认 `dist/` 包含 `js/playlist-check.js` 且 `dist/index.html` 中该引用带 `?v=`；确认源码未被构建修改。
- [x] 5.4 运行 `openspec validate "playlist-import-append" --strict`，确认变更与 delta 规格通过校验。

## Workflow follow-up

- 全部任务与评审完成后，通过 `/opsx-archive` 归档本变更，并按 OpenSpec 流程同步主规格。
