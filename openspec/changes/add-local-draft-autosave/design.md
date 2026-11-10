# Design

## Context

- 纯 `html + js`、零构建、`file://` 直接打开、只保证 Chrome；无后端、无网络请求。
- 当前项目只存在内存：`app.js:14-19` 在启动时调用 `createDefaultProject()`，刷新即回到空白。
- 项目文件是 v3 JSON（`io.js:127`），图片以 base64 内嵌；图片资产按内容 hash 去重（`model.js:709`），并已有 v1/v2 → v3 的校验与迁移路径（`io.js:182`、`io.js:590`）。
- 编辑后的渲染汇聚在 `L.app.redraw()`：`ui.renderAll()` 末尾会调用它，`changed({ property: false })` 也只调用它（`app.js:1483`）；拖拽过程中只 `redraw()`，松手才 `ui.renderAll()`。这是自动保存最可靠的挂载点。
- 实测 Chrome `file://`：localStorage 约 4–5MB 即 `QuotaExceededError`；IndexedDB 可写 Blob 且刷新后保留，`navigator.storage.estimate().quota` 约 4.3GB；`navigator.storage.persist()` 返回 `false`；`location.origin` 为 `file://`。
- `font-selection` 规范明确禁止把本机字体列表写入 localStorage；草稿只保存项目数据。

## Goals / Non-Goals

**Goals:**

- 编辑后自动保存，刷新/重新打开自动恢复，不需要手动“保存”。
- 单工作区；导入/导出继续作为文件交换与备份路径。
- 不引入后端、构建步骤或运行时依赖；`file://` 直接打开仍可用。
- 复用现有 v3 校验、迁移和图片资产构建路径，旧项目文件保持兼容。
- 存储失败可见，但不阻塞编辑和导出。

**Non-Goals:**

- 浏览器内多项目库、命名项目、项目切换。
- 跨设备同步、云存储。
- 撤销/重做或历史版本快照。
- 多标签页写冲突仲裁。
- 持久化缩放、滚动位置或选中状态（只恢复当前页）。
- 修改 PNG 导出或项目 JSON 格式。

## Decisions

### D1. 单工作区自动草稿

当前项目就是草稿；启动自动恢复，导入项目会替换草稿，新建项目会清空草稿。不引入项目列表或多草稿。

替代方案：浏览器内多项目库。范围更大，需要命名、列表、删除和每项目资产隔离，本次不做。

### D2. 结构放 localStorage，图片放 IndexedDB

```text
localStorage
  listify.draft.v1       -> { schema, savedAt, ui, project }  // 项目结构，无 base64
  listify.draft.corrupt  -> 恢复失败时保留的原始副本

IndexedDB "listify-draft"
  store "assets" (keyPath id)
                         -> { id, name, mime, data }         // data 为 base64
```

理由：

- 结构小、写入快、同步 API，适合在 `pagehide` 前做最后一次落盘，刷新不丢。
- 图片大，放 IDB 避免 localStorage 约 5MB 配额和 base64 膨胀；资产仍按内容 hash 去重。
- 仍完全是浏览器本地存储，不违反“文件不离开本机”。

替代方案：

- **只用 localStorage**：一张背景图就可能超过配额；不可行。
- **整份 v3 JSON 放 IDB**：代码最少，但每次自动保存都会重写全部 base64 图片，图多时卡顿且浪费磁盘。
- **全放 IDB（含结构）**：启动恢复异步，且最后一次编辑到写入之间仍有刷新窗口。
- **File System Access API 自动写文件**：`file://` 下 API 可用，但每次会话通常要重新授权，和“导入/导出”模型冲突。

键名与数据库名统一加 `listify` 前缀：Chrome 的 `file://` origin 显示为 `file://`，本地页面之间可能共享存储域，必须避免和其它本地页面撞名。

### D3. 草稿数据形状

```js
// localStorage['listify.draft.v1']
{
  schema: 1,
  savedAt: 1720000000000,
  ui: { currentPageId: '...' },
  project: {
    version: 3,
    pageSize, margins, playlist, backgrounds,
    unifiedBackground, unifiedBackgroundId,
    pages,
    assets: [{ id, name, mime }]   // 只有元数据
  }
}
```

- `project` 与导出的 v3 JSON 结构一致，只是 `assets` 不含 `data`。
- 恢复时从 IDB 读回资产，拼成完整的 `raw.assets`，再走现有 `validateProject` / `buildProject`。
- `schema` 是草稿存储格式版本；`project.version` 是项目数据版本。两者分开，未来可独立迁移。
- 资产在 IDB 中存 base64 而不是 Blob，是为了复用现有“base64 → Blob → Image”的构建和校验路径；33% 体积开销在 IDB 配额下可接受。如果以后启动解码成为瓶颈，再改为 Blob + 懒加载。

### D4. 自动保存调度

```text
编辑
  -> redraw()
  -> debounce 300ms
  -> 序列化结构，与上次保存的字符串比较
       -> 相同：跳过
       -> 不同：localStorage 同步写入
  -> 新资产：写 IDB（每次资产只写一次）

pagehide / visibilitychange(hidden)
  -> 立即同步写入结构（不再等 debounce）
```

- 勾在 `redraw()` 上而不是逐个业务函数：`ui.renderAll()` 和 `changed({ property: false })` 最终都会走到它，拖拽结束、属性输入、行内文字提交都能覆盖。
- debounce + 字符串比较：拖拽和缩放会高频 `redraw()`，但不会每次写盘；纯视图变化（缩放、滚动、选中）结构不变，直接跳过。
- `pagehide`/`visibilitychange` 同步 flush 结构，覆盖“改完立刻刷新/关页”的情况。
- 恢复草稿、导入项目、新建项目期间设 `restoring` / `switching` 标志，暂停自动保存，避免用半成品覆盖草稿。
- 当前页切换时同步更新 `ui.currentPageId`；选中、缩放、滚动不保存。

### D5. 资产先落盘，再让项目引用

- 新图片走 `L.assets.addFile()` 成功后，先把 base64 记录写入 IDB，再把元素/背景图片加入项目。
- 导入项目时，先校验并构建临时资产，写完 IDB 后再替换 `state.project` 和草稿。
- 自动保存时做一次对账：写入新引用资产 → 写入结构 → 删除不再被引用的资产记录。顺序保证草稿不会引用已被删除的资产。
- 如果 IDB 写入失败，导入/编辑仍在内存中继续，状态显示“草稿未保存”；用户仍可导出 JSON。

### D6. 启动恢复

```text
init
  -> 同步读 localStorage 草稿
  -> 解析 envelope + 检查 schema / project.version
  -> 读 IDB 资产
  -> 缺失资产：备份原始草稿，移除对应图片引用并记录数量
  -> 拼成完整 raw v3
  -> validateProject -> buildProject -> installAssets
  -> 设置 state.project、currentPageId
  -> 首次 render，然后启用自动保存
```

- 在第一次 `ui.renderAll()` 之前完成恢复，避免先渲染空白项目再闪烁替换。
- `currentPageId` 无效时回到第一页；其余内容不变。
- `buildProject` 会预解码所有图片，沿用现有行为；图片很多时启动会短暂等待，先接受，后续可改为按需解码。
- 草稿损坏或版本高于当前支持：把原始值备份到 `listify.draft.corrupt`，打开空白项目并提示，不静默覆盖。
- 图片资产缺失：把原始草稿备份到 corrupt 槽，恢复其余内容，移除缺失图片引用并提示丢失数量；再次保存后草稿变为可用的精简版本。
- localStorage/IndexedDB 不可用：打开默认项目，进入内存模式，状态提示草稿不可用；编辑和导出仍可用。

### D7. 导入 / 导出 / 新建

- **导出项目**：继续使用现有 `io.serializeProject()` + `downloadProject()`，输出 v3 JSON；文件名保持 `歌单项目.json`。
- **导入项目**：选择文件 → 解析/校验/构建临时资产 → 校验通过后弹确认“会替换当前草稿，且不可撤销” → 确认后写资产、安装项目、写草稿。校验失败或用户取消时，当前项目和草稿不变。
- **新建项目**：确认后重置为 `createDefaultProject()`，清除草稿结构和 IDB 资产，写入新的空白草稿，刷新后保持空白。
- 按用户选择，确认框只做普通确认：不提供“先导出”快捷按钮，不自动保留上一版快照。
- 导入/导出只改按钮文案和提示文案；内部仍可沿用 `btn-save` / `btn-load` 的 id，避免无意义的 DOM 改动。

### D8. 失败与状态

- 顶栏品牌旁增加草稿状态：
  - `草稿已自动保存 HH:MM`
  - `草稿未保存`（红色，title 或提示里带原因）
  - `草稿不可用`（存储被禁用）
- 保存失败只在状态变化时 toast 一次，避免每次编辑都弹提示；后续保存成功自动恢复状态。
- 不使用 `navigator.storage.persist()`：实测 `file://` 下返回 `false`，没有实际收益。
- 导出项目是长期备份；草稿会随“清除浏览数据”、换浏览器配置或存储压力消失，这一点需要在使用说明/文案里明确。

### D9. 多标签页

同一 `file://` 页面开两个标签时，两边都会自动保存，最后写入者覆盖。本次按已知限制处理，不做锁或合并。

可选的低成本缓解：监听 `storage` 事件，发现另一标签页写入时提示“另一标签页更新了草稿，刷新可载入最新版本”，但不自动重载，避免覆盖当前未保存编辑。该提示可以在实现时一并加入，不改变数据模型。

## Risks / Trade-offs

- [localStorage 约 5MB 且可能与其它本地页面共享] → 只存结构；键名加 `listify` 前缀；结构异常大时按保存失败处理并提示。
- [草稿会被浏览器清除或回收] → 导出 JSON 是唯一边界明确的长期备份；UI 文案说明。
- [IDB 写入失败或资产缺失] → 内存继续、状态提示；恢复时移除缺失图片引用并保留其余内容。
- [图片很多时启动预解码慢] → 先沿用现有 `buildProject` 行为；后续可改 Blob + 懒解码。
- [base64 在 IDB 中多占 33%] → 配额足够；每次资产只写一次，不随自动保存重写。
- [多标签页覆盖] → 已知限制；可选 `storage` 事件提示，不做自动合并。
- [自动保存触发过频] → 挂在 `redraw()` 上但 debounce + 结构比较；视图变化不写盘。

## Migration Plan

- 新增 `listify.draft.v1` 和 `listify-draft` 数据库，没有旧草稿需要迁移。
- 现有 v1/v2/v3 项目 JSON 继续通过原有导入路径加载；文件格式不变。
- 未来若草稿结构变化，提升 `schema` 并在恢复时迁移；迁移失败按损坏草稿处理。
- 回滚：移除自动保存代码后，遗留的 localStorage/IDB 键不会影响应用；项目文件仍可正常导入/导出。

## Open Questions

- 多标签页是否升级为真正的单写者锁，留待后续。
- 是否把图片资产从 base64 改为 Blob + 按需解码，取决于实际启动耗时。
- 导出文件名是否加入时间戳，暂不改变现有固定文件名。
- 恢复草稿后是否额外 toast 提示“已恢复上次草稿”，可在实现时按状态文案决定。
