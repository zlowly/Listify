# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: 保存项目`
- TO: `### Requirement: 导出项目`
- FROM: `### Requirement: 加载项目`
- TO: `### Requirement: 导入项目`

## MODIFIED Requirements

### Requirement: 导出项目
系统 SHALL 把当前项目导出为本地 JSON 文件；文件 MUST 包含版本号、全局页面尺寸、边距、歌单数据、全部页面、内容元素、背景库（含未被任何页面引用的背景）、每页 `backgroundId`、全局背景开关与全局背景 ID、图片资产；图片 SHALL 以 base64 存储；页面 MUST NOT 再写入 `background` 或 `backgroundRef`。

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

### Requirement: 导入项目
系统 SHALL 允许用户选择项目 JSON 并恢复页面、元素、歌单、图片、背景库、每页背景引用和全局背景设置；在替换当前项目之前 SHALL 要求确认；导入前 SHALL 校验版本和基本结构；版本 1 和 2 SHALL 自动迁移到版本 3；校验失败 SHALL 报错并保留当前项目和当前草稿不变；导入成功后 SHALL 用导入项目替换当前草稿。

#### Scenario: 导入前确认
- **WHEN** 用户选择了有效的项目文件
- **THEN** 系统先确认是否用该项目替换当前草稿，确认后才执行替换

#### Scenario: 加载有效项目
- **WHEN** 用户选择由本应用保存的版本 3 JSON
- **THEN** 页面、版面、背景库、每页背景和歌单恢复，可继续编辑

#### Scenario: 加载版本 2 项目
- **WHEN** 用户导入版本 2 项目
- **THEN** 系统把引用组折叠为背景，组成员写同一 `backgroundId`，画面与导入前一致

#### Scenario: 加载版本 1 项目
- **WHEN** 用户导入版本 1 项目
- **THEN** 系统按迁移规则转换图片填充模式，并为每页建立独立背景，项目可继续编辑

#### Scenario: 加载损坏 JSON
- **WHEN** 文件不是合法 JSON 或缺少必要字段
- **THEN** 系统报错，当前项目和当前草稿都不被替换

#### Scenario: 导入后刷新
- **WHEN** 用户成功导入项目后刷新页面
- **THEN** 恢复的是刚导入的项目，而不是导入前的草稿

## ADDED Requirements

### Requirement: 草稿自动保存
系统 SHALL 在当前工作区发生编辑后自动保存草稿；草稿 MUST 包含页面、元素、歌单、背景库、每页 `backgroundId`、全局背景设置、图片资产和当前页；用户 MUST NOT 需要手动保存。

#### Scenario: 编辑后刷新
- **WHEN** 用户导入歌单、添加页面并调整版面后刷新
- **THEN** 页面、元素、歌单、背景和当前页恢复

#### Scenario: 图片资产保留
- **WHEN** 项目使用了背景图或自由图片后刷新
- **THEN** 图片仍能显示，不依赖原始文件路径

#### Scenario: 未放置分类保留
- **WHEN** 歌单中存在未放置到页面的分类后刷新
- **THEN** 该分类仍出现在左侧未放置列表

#### Scenario: 立即刷新
- **WHEN** 用户完成一次编辑后立即刷新或关闭页面
- **THEN** 最近一次编辑仍被保存

### Requirement: 草稿启动恢复
打开编辑器时，系统 SHALL 自动恢复最近草稿并保持可继续编辑；没有草稿时 SHALL 打开默认空白项目；草稿损坏或版本不受支持时 SHALL 提示且不得静默加载；草稿引用的图片资产缺失时 SHALL 恢复其余内容并提示缺失图片，MUST NOT 以空白图片静默替代。

#### Scenario: 重新打开
- **WHEN** 用户关闭页面后重新打开编辑器
- **THEN** 自动恢复上次草稿，无需手动导入

#### Scenario: 没有草稿
- **WHEN** 浏览器中不存在草稿
- **THEN** 打开默认空白项目

#### Scenario: 草稿损坏
- **WHEN** 草稿不是合法 JSON 或结构校验失败
- **THEN** 系统提示草稿无法恢复并打开空白项目，原始草稿数据保留供恢复

#### Scenario: 版本不受支持
- **WHEN** 草稿版本高于当前支持版本
- **THEN** 系统提示版本不支持，不加载草稿，原始草稿数据保留供恢复

#### Scenario: 图片资产缺失
- **WHEN** 草稿引用的部分图片资产在浏览器存储中缺失
- **THEN** 系统恢复页面、歌单和其余内容，移除缺失图片并提示丢失数量

#### Scenario: 记住的页面不存在
- **WHEN** 草稿记录的当前页已不存在
- **THEN** 系统恢复到第一页，项目其余内容不变

### Requirement: 草稿存储失败
自动保存失败时，系统 SHALL 显示未保存状态并保留当前编辑；用户 MUST 仍能继续编辑和导出项目；下一次保存成功后状态 SHALL 恢复。

#### Scenario: 配额不足
- **WHEN** 浏览器因存储空间不足拒绝写入草稿
- **THEN** 系统显示草稿未保存并提示原因，编辑和导出仍可用

#### Scenario: 存储不可用
- **WHEN** 浏览器禁用本地存储
- **THEN** 用户仍能编辑和导出项目，状态明确提示草稿不可用

#### Scenario: 恢复保存
- **WHEN** 后续自动保存成功
- **THEN** 状态恢复为已保存并显示最近保存时间

### Requirement: 新建项目
新建项目 SHALL 重置为默认空白项目、清除当前草稿和图片资产；执行前 SHALL 要求确认；该动作 SHALL 不可撤销。

#### Scenario: 确认后新建
- **WHEN** 用户确认新建项目
- **THEN** 项目变为一页空白页、空歌单和默认背景

#### Scenario: 取消新建
- **WHEN** 用户在确认框中取消
- **THEN** 当前项目和草稿保持不变

#### Scenario: 新建后刷新
- **WHEN** 用户新建项目后刷新页面
- **THEN** 打开的是新的空白项目，旧草稿不会恢复
