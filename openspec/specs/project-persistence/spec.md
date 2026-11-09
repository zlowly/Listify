# project-persistence Specification

## Purpose
让用户把歌单、页面、版面和图片资产保存为本地 JSON，并在之后重新加载继续编辑。

## Requirements

### Requirement: 保存项目
系统 SHALL 把当前项目下载为本地 JSON 文件；文件 MUST 包含版本号、全局页面尺寸、边距、歌单数据、全部页面、内容元素、背景库（含未被任何页面引用的背景）、每页 `backgroundId`、全局背景开关与全局背景 ID、图片资产；图片 SHALL 以 base64 存储；页面 MUST NOT 再写入 `background` 或 `backgroundRef`。

#### Scenario: 保存后重新打开
- **WHEN** 用户保存项目并关闭页面
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

### Requirement: 加载项目
系统 SHALL 允许用户选择项目 JSON 并恢复页面、元素、歌单、图片、背景库、每页背景引用和全局背景设置；加载前 SHALL 校验版本和基本结构；版本 1 和 2 SHALL 自动迁移到版本 3；校验失败 SHALL 报错并保留当前项目不变。

#### Scenario: 加载有效项目
- **WHEN** 用户选择由本应用保存的版本 3 JSON
- **THEN** 页面、版面、背景库、每页背景和歌单恢复，可继续编辑

#### Scenario: 加载版本 2 项目
- **WHEN** 用户加载版本 2 项目
- **THEN** 系统把引用组折叠为背景，组成员写同一 `backgroundId`，画面与加载前一致

#### Scenario: 加载版本 1 项目
- **WHEN** 用户加载版本 1 项目
- **THEN** 系统按迁移规则转换图片填充模式，并为每页建立独立背景，项目可继续编辑

#### Scenario: 加载损坏 JSON
- **WHEN** 文件不是合法 JSON 或缺少必要字段
- **THEN** 系统报错，当前项目不被替换

### Requirement: 图片资产去重
项目 SHALL 按图片内容标识资产；相同图片字节被内容元素或多个背景使用时 MUST 只保存一份；内容元素和背景图片 SHALL 通过资产 ID 引用图片；替换图片 SHALL 产生新资产；删除背景或图片 SHALL 只在没有其它引用时释放资产。

#### Scenario: 两页共用一张图
- **WHEN** 第 1 页和第 2 页使用同一张背景图
- **THEN** JSON 中该图片只出现一次

#### Scenario: 换图产生新资产
- **WHEN** 用户在某页把背景换成另一张图
- **THEN** 新图作为新资产保存，原资产仍可被其它背景或内容引用

#### Scenario: 删除后释放资产
- **WHEN** 用户删除某背景的唯一图片，且没有其它元素或背景引用该资产
- **THEN** 保存的 JSON 不再包含该资产

### Requirement: 项目版本
项目 JSON SHALL 包含版本号；当前支持版本 SHALL 为 3；版本 1 和 2 SHALL 自动迁移到 3；系统 SHALL 只接受版本 1、2、3，其它版本 MUST 拒绝加载并给出明确提示。

#### Scenario: 版本 1 项目
- **WHEN** 用户加载版本号为 1 的项目
- **THEN** 系统完成迁移并以版本 3 继续编辑

#### Scenario: 版本 2 项目
- **WHEN** 用户加载版本号为 2 的项目
- **THEN** 系统完成迁移并以版本 3 继续编辑

#### Scenario: 未来版本
- **WHEN** 用户加载版本号高于 3 的项目
- **THEN** 系统提示版本不支持，不尝试部分加载

#### Scenario: 未知版本
- **WHEN** 用户加载版本号不是 1、2 或 3 的项目
- **THEN** 系统提示版本不支持，不替换当前项目

### Requirement: 往返一致
保存后重新加载 SHALL 保持页面顺序、全局尺寸和边距、元素坐标与尺寸、子分区样式、表格结构、手动列宽、z-order、图片旋转角度、等比锁定、透明度和模糊、背景库名称/填充色/图片顺序/每图定位与自定义矩形/透明度/模糊/旋转/等比锁定、每页 `backgroundId`、全局背景开关与全局背景 ID、歌单原始顺序；未放置分类 SHALL 也被保留；未被页面引用的背景 SHALL 也被保留。

#### Scenario: 版面往返
- **WHEN** 用户保存含两个页面和未放置分类的项目后重新加载
- **THEN** 两页版面、层级和未放置分类与保存前一致

#### Scenario: 手动列宽往返
- **WHEN** 项目中的表格使用手动列宽
- **THEN** 加载后列宽仍为保存时的像素比例

#### Scenario: 图片变换往返
- **WHEN** 图片设置了 37 度旋转、关闭等比锁定并设置模糊
- **THEN** 加载后旋转、等比状态和模糊值保持不变

#### Scenario: 背景引用往返
- **WHEN** 第 2、3 页引用同一背景并保存
- **THEN** 加载后修改该背景仍会同步到第 2、3 页

#### Scenario: 背景库往返
- **WHEN** 项目有两个背景、三张背景图和一张未使用背景
- **THEN** 加载后背景名称、颜色、图片顺序、每图 fit/自定义矩形/旋转/等比/透明度/模糊和未使用背景都与保存前一致

#### Scenario: 全局模式往返
- **WHEN** 全局背景开启，第 1 页存有另一个 `backgroundId`
- **THEN** 加载后全局开关/ID 和第 1 页的 `backgroundId` 都保持不变

### Requirement: 资源缺失处理
项目引用的图片资产缺失或损坏，或页面 `backgroundId`、全局 `unifiedBackgroundId` 指向不存在的背景时，系统 SHALL 报错并保留当前项目，不得静默加载为空白图片或失效引用。

#### Scenario: 资产缺失
- **WHEN** JSON 中某元素引用了不存在的资产 ID
- **THEN** 系统提示项目损坏并停止加载

#### Scenario: 背景图片资产缺失
- **WHEN** JSON 中某张背景图引用不存在的资产 ID
- **THEN** 系统提示项目损坏并停止加载

#### Scenario: 背景引用失效
- **WHEN** JSON 中某页的 `backgroundId` 指向不存在的背景
- **THEN** 系统提示项目损坏并停止加载

#### Scenario: 全局背景引用失效
- **WHEN** 全局背景开启，`unifiedBackgroundId` 指向不存在的背景
- **THEN** 系统提示项目损坏并停止加载
