# Proposal

## Why

草稿里只要含图片资产，刷新后一定恢复失败并弹出「草稿无法恢复」，项目被替换成空白页。原因是一处编码格式不一致：`draftAssetGetAll()` 把 IndexedDB 里的二进制资产读成 **data URL**（`data:image/png;base64,…`），而 `buildProject()` 用 `L.assets.base64ToBlob()` 直接 `atob()` 整串，于是抛「图片数据不是合法 base64」，`restoreDraft()` 据此判定草稿损坏。

这违背 `project-persistence` 已写明的要求：草稿资产以二进制保存，base64 只用于项目 JSON 交换，恢复时需兼容旧格式。缺陷由上一版 `b4c694b`（草稿性能优化）引入，影响所有带背景图或自由图片的项目。

## What Changes

- 二进制资产读取时返回**纯 base64**，不再返回 data URL：`draftAssetGetAll()` 的二进制分支改用去掉前缀的编码结果。
- 恢复时对资产数据做一次**前缀归一化**：无论记录来自二进制库还是旧的 base64 记录，`data:…;base64,` 前缀都在赋值给 `asset.data` 前剥掉，兼容历史上可能以 data URL 形式写入的记录。
- 补一条零依赖回归用例：构造一个二进制 Blob 记录（含 PNG 头字节），经 `draftAssetGetAll()` 读出的 `data` 必须能通过 `L.assets.base64ToBlob()` 解码回等价字节，且 `restoreDraft()` 端到端不再报 corrupt。
- 不改变草稿结构、存储键、写入路径与同步兜底逻辑；不引入新依赖。

## Capabilities

### New Capabilities

<!-- 无新增能力。 -->

### Modified Capabilities

- `project-persistence`: 「草稿资产以二进制保存」一条补齐恢复侧的编码契约——读出的数据 SHALL 是纯 base64（可被 `atob` 直接解码），恢复 MUST 兼容并剥除历史 data URL 前缀，MUST NOT 因编码前缀把可用草稿判为损坏。

## Impact

- `js/draft-store.js`：`draftAssetGetAll()` 的二进制分支编码方式；`restoreDraft()` 中 `asset.data` 赋值的归一化。
- `js/assets.js`：复用现有 `base64ToBlob` / `blobToBase64`，不新增实现（如需要在 draft-store 内引用则改为调用 `L.assets` 的既有函数）。
- 测试：新增 `scripts/checks/` 下的草稿编码回归用例（Node 沙箱 + IndexedDB 不可用，需以纯函数形式导出可测的归一化/编码步骤，或在现有 loader 桩上模拟记录）。
- 用户可见行为：带图片的项目刷新后可正常恢复；损坏提示只在对应用户真的损坏时出现。
- 无构建、无依赖、无 schema 变化；不影响 `layer-panel-reorder` 的图层面板改动。
