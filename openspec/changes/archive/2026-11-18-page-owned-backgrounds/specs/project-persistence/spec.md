# Spec Delta

## ADDED Requirements

### Requirement: 导出项目文件
系统 SHALL 把当前项目导出为本地 JSON 文件；文件 MUST 包含版本号、全局页面尺寸、边距、歌单数据、全部页面、内容元素、每页的背景（填充色与有序图片列表）、全局背景来源页 ID、图片资产；图片 SHALL 以 base64 存储；文件 MUST NOT 包含背景库、背景名称、`backgroundId`、`backgroundRef`、`unifiedBackground` 或 `unifiedBackgroundId`。

#### Scenario: 保存后重新打开
- **WHEN** 用户导出项目并关闭页面
- **THEN** 得到的 JSON 包含当前所有页面、每页背景和歌单数据

#### Scenario: 图片内嵌
- **WHEN** 项目使用背景图和自由图片
- **THEN** JSON 中包含对应图片的 base64 数据，不依赖原始文件路径

#### Scenario: 保存每页背景
- **WHEN** 三页使用三种不同的背景
- **THEN** JSON 为每页分别保存填充色与图片列表，不保存共享背景实体

#### Scenario: 保存全局来源页
- **WHEN** 全局背景来源为第 2 页且各页背景不同
- **THEN** JSON 记录 `globalBackgroundPageId` 指向第 2 页，并仍保存每页自己的背景

#### Scenario: 不保存背景库
- **WHEN** 用户导出项目
- **THEN** JSON 中不存在背景库、背景名称、使用页数或页面到背景的引用

## MODIFIED Requirements

### Requirement: 导入项目
系统 SHALL 允许用户选择项目 JSON 并恢复页面、元素、歌单、图片、每页背景和全局背景来源页；在替换当前项目之前 SHALL 要求确认；导入前 SHALL 校验版本和基本结构；版本 1、2、3 SHALL 自动迁移到版本 4；校验失败 SHALL 报错并保留当前项目和当前草稿不变；导入成功后 SHALL 用导入项目替换当前草稿。

#### Scenario: 导入前确认
- **WHEN** 用户选择了有效的项目文件
- **THEN** 系统先确认是否用该项目替换当前草稿，确认后才执行替换

#### Scenario: 加载有效项目
- **WHEN** 用户选择由本应用保存的版本 4 JSON
- **THEN** 页面、版面、每页背景、全局来源页和歌单恢复，可继续编辑

#### Scenario: 加载版本 3 项目
- **WHEN** 用户导入版本 3 项目
- **THEN** 每页 `backgroundId` 对应的背景展开为该页自己的背景副本，图片资产共享

#### Scenario: 版本 3 的全局背景迁移
- **WHEN** 版本 3 项目开启全局背景，且第 2 页使用该背景
- **THEN** 导入后第 2 页成为全局来源页，各页保留自己的背景副本，取消全局后恢复各自背景

#### Scenario: 版本 3 全局背景没有页面引用
- **WHEN** 版本 3 项目开启全局背景，但没有任何页面的 `backgroundId` 指向该背景
- **THEN** 导入时把该背景复制到第一页并令其成为全局来源页，保证画面不变

#### Scenario: 加载版本 2 项目
- **WHEN** 用户导入版本 2 项目
- **THEN** 系统把引用组折叠为每页自己的背景副本，画面与导入前一致

#### Scenario: 加载版本 1 项目
- **WHEN** 用户导入版本 1 项目
- **THEN** 系统按迁移规则转换图片填充模式，并为每页建立独立背景，项目可继续编辑

#### Scenario: 全局来源页无效
- **WHEN** 文件中的 `globalBackgroundPageId` 指向不存在的页面
- **THEN** 校验失败并报错，不替换当前项目

#### Scenario: 加载损坏 JSON
- **WHEN** 文件不是合法 JSON 或缺少必要字段
- **THEN** 系统报错，当前项目和当前草稿都不被替换

#### Scenario: 导入后刷新
- **WHEN** 用户成功导入项目后刷新页面
- **THEN** 恢复的是刚导入的项目，而不是导入前的草稿

### Requirement: 草稿自动保存
系统 SHALL 在当前工作区发生编辑后自动保存草稿；草稿 MUST 包含页面、元素、歌单、每页背景、全局背景来源页、图片资产和当前页；用户 MUST NOT 需要手动保存。

#### Scenario: 编辑后刷新
- **WHEN** 用户导入歌单、添加页面并调整版面后刷新
- **THEN** 页面、元素、歌单、每页背景和当前页恢复

#### Scenario: 图片资产保留
- **WHEN** 项目使用了背景图或自由图片后刷新
- **THEN** 图片仍能显示，不依赖原始文件路径

#### Scenario: 未放置分类保留
- **WHEN** 歌单中存在未放置到页面的分类后刷新
- **THEN** 该分类仍出现在左侧未放置列表

#### Scenario: 立即刷新
- **WHEN** 用户完成一次编辑后立即刷新或关闭页面
- **THEN** 最近一次编辑仍被保存

#### Scenario: 旧草稿迁移
- **WHEN** 浏览器中存在版本 3 项目结构的旧草稿
- **THEN** 草稿按版本 3 到版本 4 的规则迁移后恢复，不报版本不支持

## REMOVED Requirements

### Requirement: 导出项目
系统 SHALL 把当前项目导出为本地 JSON 文件；文件 MUST 包含版本号、全局页面尺寸、边距、歌单数据、全部页面、内容元素、背景库（含未被任何页面引用的背景）、每页 `backgroundId`、全局背景开关与全局背景 ID、图片资产；图片 SHALL 以 base64 存储；页面 MUST NOT 再写入 `background` 或 `backgroundRef`。

**Reason**: 版本 4 改为每页自持背景，不再保存背景库、每页背景引用与全局背景开关；替代需求为「导出项目文件」。

**Migration**: 旧文件的背景库在导入时展开为每页背景，见导入项目的迁移路径。

#### Scenario: 保存后重新打开
- **WHEN** 用户导出项目并关闭页面
- **THEN** 得到的 JSON 包含当前所有页面和歌单数据

#### Scenario: 图片内嵌
- **WHEN** 项目使用背景图和自由图片
- **THEN** JSON 中包含对应图片的 base64 数据，不依赖原始文件路径

#### Scenario: 保存背景库
- **WHEN** 背景库中有一个没有被任何页面引用的背景
- **THEN** JSON 仍包含该背景及其图片资产

#### Scenario: 保存全局背景
- **WHEN** 全局背景开启且各页 `backgroundId` 不同
- **THEN** JSON 同时记录 `unifiedBackground`、`unifiedBackgroundId` 和每页的 `backgroundId`

#### Scenario: 保存引用背景
- **WHEN** 多个页面共享同一背景
- **THEN** JSON 记录背景库和每页 `backgroundId`，重新加载后这些页面仍保持同步

