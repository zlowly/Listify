# Spec Delta

## REMOVED Requirements

### Requirement: 当前页导出
**Reason**: 导出范围改为由用户在对话框中显式选择，不再固定为当前页。
**Migration**: 默认仍为本页，原有单页导出行为不变；需要多页时选择“所有页”，产物为一个 ZIP。

## ADDED Requirements

### Requirement: 导出范围
系统 SHALL 在导出对话框中提供“本页”和“所有页”两个范围选项，默认 SHALL 为本页。选择本页时 SHALL 只生成当前页的 PNG；选择所有页时 SHALL 生成一个包含全部页面 PNG 的 ZIP 文件。项目只有 1 页时选择所有页 SHALL 直接生成 PNG，不生成 ZIP。

#### Scenario: 默认导出本页
- **WHEN** 用户打开导出对话框并直接确认
- **THEN** 只生成当前页的 PNG

#### Scenario: 导出所有页
- **WHEN** 用户选择所有页并确认
- **THEN** 生成一个 ZIP，内含每一页的 PNG

#### Scenario: 只有一页时选择所有页
- **WHEN** 项目只有 1 页，用户选择所有页并确认
- **THEN** 直接生成该页的 PNG，不生成 ZIP

### Requirement: 多页 ZIP 打包
所有页导出 SHALL 生成单个 ZIP 文件，内含每页一个 PNG；条目顺序 SHALL 与页签顺序一致；条目文件名 SHALL 包含补零后的页码；导出 MUST NOT 触发浏览器的多次下载提示。导出过程中 SHALL 显示已完成页数与总页数。

#### Scenario: ZIP 条目与顺序
- **WHEN** 用户导出 8 页
- **THEN** ZIP 内含 8 个 PNG，顺序与页签一致，文件名为 `歌单_第01页.png` 到 `歌单_第08页.png`

#### Scenario: 单次下载
- **WHEN** 用户导出所有页
- **THEN** 浏览器只发起一次文件下载，不出现多文件下载提示

#### Scenario: 显示进度
- **WHEN** 导出进行到第 3 页（共 8 页）
- **THEN** 对话框显示已完成 3 页、共 8 页

#### Scenario: 取消导出
- **WHEN** 所有页导出过程中用户关闭对话框
- **THEN** 停止后续页面，不生成 ZIP

### Requirement: 导出内容模式
导出对话框 SHALL 提供“完整页面”和“仅歌单层（透明底）”两个内容选项，默认 SHALL 为完整页面。内容选择 SHALL 只影响本次导出，MUST NOT 修改项目数据或编辑态预览。

#### Scenario: 默认完整页面
- **WHEN** 用户打开导出对话框
- **THEN** 导出内容默认为完整页面

#### Scenario: 切换内容模式不改变画布
- **WHEN** 用户选择仅歌单层并取消导出
- **THEN** 画布上的背景、自由文字和自由图片仍然可见，项目数据不变

### Requirement: 透明歌单层导出
选择“仅歌单层（透明底）”时，输出 PNG SHALL 保持页面尺寸并带透明背景；SHALL 只绘制分类块（分类名与歌名表格）；MUST NOT 绘制背景填充色、背景图片、自由文字或自由图片；SHALL 按页面边界裁剪。所有页导出时，没有分类块的页面 SHALL 被跳过，并在结束时报告页码。

#### Scenario: 透明底只含分类块
- **WHEN** 页面有背景图、自由文字、自由图片和分类块，用户选择仅歌单层
- **THEN** PNG 只显示分类块，其余区域完全透明

#### Scenario: 透明模式按页面裁剪
- **WHEN** 分类块超出页面底边
- **THEN** 透明 PNG 只包含页面内的部分

#### Scenario: 跳过空页
- **WHEN** 所有页导出中第 4 页没有分类块
- **THEN** 第 4 页不进入 ZIP，结束后提示该页已跳过

#### Scenario: 单页没有分类块
- **WHEN** 当前页没有分类块，用户选择仅歌单层并导出本页
- **THEN** 系统提示没有可导出的分类块，不生成文件

## MODIFIED Requirements

### Requirement: 完整内容与裁剪
完整页面模式 SHALL 包含所选页面的背景和全部内容元素；透明歌单层模式 SHALL 只包含分类块；两种模式 SHALL 按页面边界裁剪，页面外的元素部分 MUST NOT 出现；导出 SHALL 等待所需字体和图片加载完成。

#### Scenario: 溢出元素
- **WHEN** 分类块超出页面底边
- **THEN** PNG 只包含页面内的部分

#### Scenario: 背景与文字
- **WHEN** 页面有背景图和自由文字，且选择完整页面
- **THEN** PNG 同时包含背景图和文字

### Requirement: 导出失败处理
单页导出时，图片加载失败、字体加载失败或画布导出失败，系统 SHALL 显示错误并且 MUST NOT 下载不完整或空白的 PNG。所有页导出时，任意一页失败 SHALL 中止整批并且 MUST NOT 下载 ZIP。

#### Scenario: 背景图加载失败
- **WHEN** 完整页面模式下当前页背景图无法加载
- **THEN** 系统提示导出失败，不产生下载文件

#### Scenario: 多页中途失败
- **WHEN** 所有页导出进行到第 5 页时渲染失败
- **THEN** 系统提示第 5 页失败，不产生 ZIP

#### Scenario: 透明模式忽略背景图失败
- **WHEN** 背景图无法加载，但用户选择仅歌单层
- **THEN** 导出仍成功，且不包含背景图

### Requirement: 文件命名
导出的文件 SHALL 使用可识别的名称并包含页码：本页完整模式为 `歌单_第N页.png`，本页透明模式为 `歌单_第N页_透明.png`；所有页为 `歌单_N页.zip` 或 `歌单_N页_透明.zip`；ZIP 内条目 SHALL 按页码补零，例如 `歌单_第01页.png`。

#### Scenario: 文件名包含页码
- **WHEN** 用户导出第 3 页
- **THEN** 下载文件名为 `歌单_第3页.png`

#### Scenario: 单页透明模式命名
- **WHEN** 用户导出第 3 页，内容为仅歌单层
- **THEN** 下载文件名为 `歌单_第3页_透明.png`

#### Scenario: ZIP 命名
- **WHEN** 用户导出全部 8 页，内容为仅歌单层
- **THEN** 下载文件名为 `歌单_8页_透明.zip`
