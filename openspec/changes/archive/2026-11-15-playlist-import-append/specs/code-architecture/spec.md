# Spec Delta

## ADDED Requirements

### Requirement: 歌名查重单一实现
歌名重复的判断、冲突位置定位与提示文案 MUST 只有一处实现（`js/playlist-check.js`）；导入追加计划与歌单编辑器 MUST 调用同一模块，MUST NOT 各自维护扫描逻辑。该模块 MUST 为纯逻辑，可在 Node 中加载，不依赖 DOM、canvas 或浏览器存储。

#### Scenario: 单一定义
- **WHEN** 在运行时脚本中搜索歌名查重与冲突定位的实现
- **THEN** 仅命中 `js/playlist-check.js`，其余文件通过 `L.playlistCheck` 使用

#### Scenario: 纯逻辑可测试
- **WHEN** 在 Node 沙箱中加载 `js/playlist-check.js` 并传入分类数组
- **THEN** 返回重复分组与冲突位置，无需 DOM、canvas 或浏览器存储

#### Scenario: 两处结果一致
- **WHEN** 同一组分类数据分别用于导入追加计划和歌单编辑器校验
- **THEN** 得到的重复歌名分组、冲突位置与提示文案一致
