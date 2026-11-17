# Tasks

## 1. 编码归一化

- [x] 1.1 在 `js/draft-store.js` 增加一个纯函数（例如 `stripDataUrlPrefix(value)` 与 `blobToBase64Blob(blob)`），把 `data:…;base64,` 前缀剥掉、其它形式原样返回；验证：`node --check js/draft-store.js` 通过，且函数不依赖 `document`/`window` 以外的新全局
- [x] 1.2 `draftAssetGetAll()` 的二进制分支改为返回纯 base64（复用 1.1 的实现，不复制 `FileReader` 逻辑）；验证：含图片草稿读出记录的 `data` 以 `iVBOR…`/`/9j/` 之类原始 base64 开头，`data:` 前缀不再出现
- [x] 1.3 `restoreDraft()` 把记录数据赋给 `asset.data` 时统一过一遍 1.1 的前缀剥离，覆盖历史 data URL 记录；验证：`node --check` 通过，且旧格式记录在浏览器里能恢复（见 3.2）

## 2. 回归用例

- [x] 2.1 在 `scripts/checks/` 新增草稿编码用例：断言前缀剥离函数对 `data:image/png;base64,AAA`、纯 base64、空串、非字符串输入的输出，且纯 base64 结果能被 `L.assets.base64ToBlob()` 解码回原始字节；验证：`node --test scripts/checks/*.test.js` 全绿
- [x] 2.2 用例覆盖“二进制记录经 `draftAssetGetAll` 等价路径产出可解码数据”：用 `L.assets.blobToBase64` 的等价实现与 `base64ToBlob` 往返一个含 PNG 魔数的 Blob；验证：往返字节完全相等，用例数与既有套件累计通过

## 3. 浏览器验证与文档

- [x] 3.1 浏览器实测：新建项目 → 导入 `.txt` → 加两张背景图 → 等“草稿已自动保存” → 刷新；验证：无「草稿无法恢复」弹窗，背景图、歌单、页面全部恢复
- [x] 3.2 浏览器实测：在 IndexedDB 写入一条带 `data:` 前缀的旧格式资产记录后刷新；验证：同样正常恢复，不判 corrupt
- [x] 3.3 同步 `AGENTS.md` 与 `README.md` 中关于草稿资产的表述（二进制存储、base64 仅用于交换与内存交接）；验证：文档描述与实现一致

## Workflow follow-up

- 修完后回到 `layer-panel-reorder` 补 6.3 的刷新持久化验证，再分别归档两个变更。
- 实现落地后运行 `graphify update .`。
