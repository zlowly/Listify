# Tasks

## 1. 模型与持久化

- [x] 1.1 `js/model.js`：新增 `createBackgroundText()`（`kind:'text'`，固定页面坐标矩形，独立默认样式）；`cloneBackgroundItem` 支持 text 深拷贝换 ID；校验/规范化覆盖 text 条目字段
- [x] 1.2 `js/project-schema.js`：schema 接受 `kind:'text'` 背景条目，旧项目与草稿读入兼容（无 text 时行为不变）
- [x] 1.3 资产引用判断（`assetIsReferenced` 等）由 `kind !== 'shape'` 改为 `kind === 'image'` 白名单，text 条目不视为资产引用
- [x] 1.4 `scripts/checks/` 模型与 IO 回归：text 条目创建/克隆/校验/复制背景/清空/资产释放用例（`node --test scripts/checks/*.test.js` 通过）

## 2. 渲染与导出

- [x] 2.1 `js/render.js`：背景条目渲染支持 text（混排于条目列表顺序，剪裁到页面，位于内容层之下）
- [x] 2.2 `js/export.js`：PNG 导出渲染背景文字；歌单导出跳过整层（确认现有跳过逻辑覆盖）
- [x] 2.3 画布命中与变换：背景文字支持选中框、拖动、方向键微调（复用背景图形路径），被全局覆盖页只读

## 3. 工具栏统一入口

- [x] 3.1 `index.html`：插入区分「内容层/背景层」两组，背景组新增 文字/图片/图形 三个 icon-btn，`aria-label` 声明目标层
- [x] 3.2 `js/app.js`：新增背景层 `addText`/`addImage` 处理器（文字入条目列表并选中；图片走用户手势文件选择，空列表首图 `cover`、否则 `original` 居中）
- [x] 3.3 `js/app.js`：`shapeTool.target` 由所点按钮直接决定；`toggleShapeTool` 支持两入口切换（转移 `aria-pressed`）；toast 文案沿用「把 X 添加到 Y 层」模式
- [x] 3.4 全局覆盖判断：非来源页背景组三钮禁用，点击提示「需先取消全局背景」；来源页正常
- [x] 3.5 `js/ui.js`/`js/app-chrome.js`：新按钮事件绑定与按下态/禁用态同步（含属性面板重渲染后的状态保持）

## 4. 属性面板与图层面板

- [x] 4.1 `js/ui-property-panel.js`：移除「＋ 图片」「＋ 图形」按钮及其绑定；背景分组保留更换/预置、复制背景…、清空背景、全局开关
- [x] 4.2 背景文字属性字段：复用内容层文字字段构造，写入经 intent 方法（如 `setBackgroundItemField`）并调度重绘
- [x] 4.3 `js/ui.js` 图层面板：背景条目子行支持 text 行（选中、上移/下移、拖拽换序），被覆盖页仍只显示单行

## 5. 规范与收尾

- [x] 5.1 核对 `openspec/specs/background-layer`、`shape-tool`、`page-editor` 与 delta 的一致性（archive 前置检查）
- [x] 5.2 浏览器手动回归：加背景文字/图片/图形、两组按钮落点切换与按下态、全局覆盖禁用、复制背景带走文字、撤销、PNG/歌单导出
- [x] 5.3 `graphify update .` 更新知识图谱
