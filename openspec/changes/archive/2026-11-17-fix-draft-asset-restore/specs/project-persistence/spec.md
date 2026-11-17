# Spec Delta

## MODIFIED Requirements

### Requirement: 草稿资产以二进制存储

浏览器草稿库中的图片资产 SHALL 以二进制形式（Blob 或 ArrayBuffer）保存；base64 编码 SHALL 只用于项目 JSON 的导入导出交换格式，以及恢复时向 `buildProject` 交接的内存表示。恢复草稿时，MUST 兼容此前以 base64 字符串保存的资产，并 SHALL 在成功恢复后以二进制形式写回。格式升级 MUST NOT 导致旧草稿无法恢复。从草稿库读出的资产数据 SHALL 是纯 base64（不含 `data:` 前缀，可被 `atob` 直接解码）；恢复流程 SHALL 在任何情况下剥除历史记录里可能存在的 data URL 前缀，MUST NOT 因编码前缀把可用草稿判为损坏。

#### Scenario: 草稿体积

- **WHEN** 项目包含多张背景图与自由图片
- **THEN** 草稿库中的图片以二进制保存，存储占用与图片原始字节同量级，不出现 base64 带来的额外膨胀

#### Scenario: 旧草稿恢复

- **WHEN** 用户打开由旧版本保存、资产仍为 base64 的草稿
- **THEN** 页面、歌单与图片完整恢复，后续保存改用二进制存储

#### Scenario: 项目文件格式不变

- **WHEN** 用户导出项目 JSON
- **THEN** 图片仍以 base64 内嵌，文件格式与既有版本一致

#### Scenario: 含图片草稿刷新恢复

- **WHEN** 项目含一张或多张背景图，用户等到“草稿已自动保存”后刷新页面
- **THEN** 草稿正常恢复，页面、背景图与图片资产全部回来，MUST NOT 弹出“草稿无法恢复”

#### Scenario: 资产数据不带 data URL 前缀

- **WHEN** 恢复流程从草稿库读出二进制资产记录
- **THEN** 交给 `buildProject` 的 `asset.data` 是纯 base64，可被 `atob` 直接解码成原始字节

#### Scenario: 历史 data URL 记录仍可恢复

- **WHEN** 草稿库中存在以 `data:image/…;base64,` 形式保存的旧资产记录
- **THEN** 恢复时剥除前缀后正常加载图片，MUST NOT 判为损坏
