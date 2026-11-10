# font-selection Specification

## Purpose

定义编辑器中的字体选择入口如何通过 Local Font Access API 枚举、搜索和预览本机字体，并把选择结果写回分类名、歌名和自由文字的字体设置；同时明确授权、降级、隐私和持久化边界。

## Requirements

### Requirement: 字体选择入口

分类名子分区、歌名子分区和自由文字三处字体设置 SHALL 提供“西文字体”和“中文字体”两个独立的选择入口，同时保留可编辑的完整字体栈输入框。点击任一入口 SHALL 打开本机字体选择器并标明当前槽位；用户仍 SHALL 能直接编辑完整字体栈。

#### Scenario: 三处入口

- **WHEN** 用户分别选中分类块或自由文字
- **THEN** 分类名、歌名和自由文字的字体设置旁都出现“西文字体”和“中文字体”两个选择入口，以及完整字体栈输入框

#### Scenario: 槽位标识

- **WHEN** 用户从“西文字体”入口打开选择器
- **THEN** 选择器标明当前正在选择西文字体，并按西文槽位预览

#### Scenario: 保留手输

- **WHEN** 用户在完整字体栈输入框中输入自定义字体栈
- **THEN** 输入值被接受，画布按该栈渲染，不要求使用选择器

### Requirement: 浏览器能力与降级

选择器 SHALL 检测 `window.queryLocalFonts` 或 `navigator.queryLocalFonts`；两者都不存在时，系统 MUST NOT 调用 API，SHALL 禁用或隐藏西文/中文两个选择入口，并 SHALL 保留完整字体栈输入框和说明。

#### Scenario: 不支持的浏览器

- **WHEN** 用户在 Firefox 或 Safari 中打开编辑器并查看字体设置
- **THEN** 两个选择入口都不可用，完整字体栈输入框仍可编辑

#### Scenario: 支持的浏览器

- **WHEN** 支持 Local Font Access 的 Chromium 浏览器打开编辑器
- **THEN** 西文和中文两个选择入口都可用

### Requirement: 点击后授权与枚举

字体枚举 MUST 只在用户点击“选择”或“重新获取”后发起；页面加载、打开属性面板或打开选择器但未点击时 MUST NOT 调用枚举 API。首次调用 SHALL 触发浏览器的本机字体访问授权；调用进行中 SHALL 显示加载状态。

#### Scenario: 首次点击

- **WHEN** 用户首次点击“选择”
- **THEN** 浏览器显示本机字体访问授权提示，选择器显示加载状态

#### Scenario: 不自动枚举

- **WHEN** 用户打开编辑器或属性面板但没有点击字体选择按钮
- **THEN** 系统不调用 `queryLocalFonts()`，也不显示字体列表

#### Scenario: 加载中

- **WHEN** `queryLocalFonts()` 尚未完成
- **THEN** 选择器显示加载提示，并禁止重复发起同一请求

### Requirement: 字体族列表

列表 SHALL 以字体族为粒度，每个族只出现一次；同一族的 Regular、Bold、Italic 等字面 MUST NOT 作为独立选项；列表 SHALL 按用户语言的字母顺序排序，并对数字段使用自然排序。

#### Scenario: 同族多字面

- **WHEN** 本机字体数据中同一族有 Regular、Bold 和 Italic 多个字面
- **THEN** 列表中该族只出现一行

#### Scenario: 排序

- **WHEN** 字体族包含 `Noto Sans 2`、`Noto Sans 10` 和 `Adwaita Sans`
- **THEN** 列表按自然顺序排列，数字 2 排在 10 前面

### Requirement: 搜索与预览

选择器 SHALL 提供搜索框，按字体族、全名或 PostScript 名进行不区分大小写的匹配；每一行 SHALL 用该字体渲染与当前槽位匹配的示例：西文槽位使用拉丁字符，中文槽位使用中文字符；列表顶部 SHALL 提供“系统默认”项，该项 SHALL 按当前槽位恢复对应的默认字体栈。

#### Scenario: 搜索字体族

- **WHEN** 用户输入 `noto`
- **THEN** 列表中只保留族名、全名或 PostScript 名包含 `noto` 的字体族

#### Scenario: 预览中英文

- **WHEN** 用户打开选择器
- **THEN** 西文槽位每一行用该字体渲染只含拉丁字符的示例，中文槽位每一行用该字体渲染只含中文字符的示例；字体不含对应字形时按浏览器回退显示

#### Scenario: 系统默认项

- **WHEN** 用户打开选择器
- **THEN** 列表顶部始终显示“系统默认”，不受搜索过滤影响

### Requirement: 应用字体选择

用户选择某个字体族后，系统 SHALL 把该族名写入当前槽位的 `fontPair`（`latin` 或 `cjk`），并据此重新组合当前样式的 `fontFamily`；组合顺序 MUST 为西文字体在前、中文字体在后，末尾追加 `sans-serif`。系统 SHALL 同步更新完整字体栈输入框、立即重绘画布并重新排版。选择“系统默认” SHALL 只清除当前槽位的选择并恢复该槽位的默认栈。用户手动编辑完整字体栈时，系统 SHALL 以手输值为准并清除 `fontPair`。关闭选择器但不选择时 MUST NOT 改变字体。

#### Scenario: 选择字体

- **WHEN** 用户在西文槽位选择 `Adwaita Sans`
- **THEN** `fontPair.latin` 变为 `Adwaita Sans`，`fontFamily` 按“西文在前、中文在后”重新组合，输入框同步显示新栈，画布立即重绘

#### Scenario: 选择中文字体

- **WHEN** 用户在中文槽位选择 `Noto Sans SC`
- **THEN** `fontPair.cjk` 变为 `Noto Sans SC`，`fontFamily` 保留已有西文选择并在其后追加该中文字体，画布立即重绘

#### Scenario: 恢复默认

- **WHEN** 用户在中文槽位选择“系统默认”而西文槽位已有选择
- **THEN** 只有中文部分恢复默认栈，西文选择保持不变

#### Scenario: 手输栈优先

- **WHEN** 用户手动修改完整字体栈输入框
- **THEN** 系统以手输值为准渲染，并清除 `fontPair`

#### Scenario: 使用同一字体

- **WHEN** 用户点击“使用同一字体”
- **THEN** 系统清除 `fontPair`，完整字体栈输入框保持当前值，画布按该栈渲染

#### Scenario: 重新排版

- **WHEN** 用户选择的字体与原字体宽度不同
- **THEN** 画布上的换行、列宽和分类块高度按新字体重新计算

#### Scenario: 取消

- **WHEN** 用户按 Escape、点击遮罩或关闭按钮退出选择器
- **THEN** 当前字体设置保持不变

### Requirement: 拒绝、空结果与异常

授权被拒绝、API 返回空数组或调用抛错时，选择器 SHALL 显示可理解的空状态/错误提示，SHALL 提供重试入口，并 SHALL 提示用户可以继续手输字体族；这些情况 MUST NOT 导致页面崩溃或清空现有字体设置。

#### Scenario: 拒绝授权

- **WHEN** 用户在授权提示中选择拒绝
- **THEN** 选择器显示“未获得本机字体访问权限”的说明和重试按钮，字体设置保持原值

#### Scenario: 空列表

- **WHEN** API 成功返回但没有字体族
- **THEN** 选择器显示“没有找到可用字体”的说明，并保留手输入口

#### Scenario: 调用异常

- **WHEN** `queryLocalFonts()` 抛出异常
- **THEN** 选择器显示错误信息，不关闭属性面板，也不修改字体设置

### Requirement: 会话缓存与重新获取

一次成功枚举后，字体族列表 SHALL 在当前页面会话内缓存，再次打开选择器 SHALL 直接使用缓存而不重新请求；用户点击“重新获取” SHALL 再次调用 API 并替换缓存。缓存 MUST NOT 写入 localStorage 或项目文件。

#### Scenario: 再次打开

- **WHEN** 用户成功加载字体列表后关闭并再次打开选择器
- **THEN** 列表立即显示，不再次触发授权提示

#### Scenario: 重新获取

- **WHEN** 用户点击“重新获取”
- **THEN** 系统再次调用 `queryLocalFonts()`，完成后用新列表替换旧列表

### Requirement: 隐私与离线

选择器 MUST NOT 读取 `FontData.blob()` 的字体文件内容，MUST NOT 上传字体数据，MUST NOT 请求网络资源，MUST NOT 写入 localStorage；字体列表 SHALL 仅保存在内存中。无网络时选择器 SHALL 仍能工作。

#### Scenario: 离线使用

- **WHEN** 设备断网后用户打开选择器并授权
- **THEN** 本机字体列表仍能加载和选择

#### Scenario: 不读取字体文件

- **WHEN** 用户浏览和选择字体
- **THEN** 系统只使用字体元数据，不调用 `blob()` 读取字体文件

### Requirement: 持久化与跨机器回退

字体选择结果 SHALL 继续以 `fontFamily` 字符串保存到项目 JSON；样式 MAY 额外保存可选的 `fontPair`，包含可选的 `latin` 和 `cjk` 字体族名。加载时若存在 `fontPair`，系统 SHALL 以它重新组合 `fontFamily`；若不存在，系统 SHALL 直接使用已保存的 `fontFamily`，MUST NOT 静默改写旧项目。加载的项目中字体在本机不存在时，系统 SHALL 保留原字符串并按 CSS 回退栈渲染，MUST NOT 静默替换为用户选择的其它字体。

#### Scenario: 项目往返

- **WHEN** 用户通过双槽位选择字体后保存并重新加载项目
- **THEN** `fontPair` 和 `fontFamily` 都被保存，重新加载后组合结果与保存时一致

#### Scenario: 旧项目加载

- **WHEN** 加载没有 `fontPair` 的旧项目
- **THEN** 系统直接使用项目中的 `fontFamily`，不修改该字段，也不要求用户重新选择字体

#### Scenario: 旧版本读取新项目

- **WHEN** 旧版本应用加载包含 `fontPair` 的项目
- **THEN** 旧版本忽略该字段并继续按 `fontFamily` 渲染

#### Scenario: 字体缺失

- **WHEN** 项目在另一台没有该字体的机器上加载
- **THEN** 字体字符串保持不变，浏览器按回退栈渲染，系统不修改项目数据

### Requirement: 渲染与导出一致

画布渲染和 PNG 导出 SHALL 使用当前 `fontFamily` 选择的字体；导出 SHALL 继续等待字体加载完成后再生成图片。

#### Scenario: 导出所选字体

- **WHEN** 用户选择本机字体并导出当前页
- **THEN** PNG 中的文字使用该字体渲染；字体缺少的字形按浏览器回退规则显示

### Requirement: 西文优先的字体组合

系统 SHALL 以“西文字体槽位在前、中文字体槽位在后”的顺序组合字体栈；某个槽位未选择时，系统 SHALL 使用该槽位的默认字体栈。系统 MUST NOT 声称已验证西文字体不含中文字形；若西文字体自身包含中文字形，中文 MAY 由该西文字体渲染。

#### Scenario: 两个槽位都有选择

- **WHEN** 西文槽位为 `Inter`、中文槽位为 `Noto Sans SC`
- **THEN** `fontFamily` 组合为 `"Inter", "Noto Sans SC", sans-serif`

#### Scenario: 只选择西文字体

- **WHEN** 用户只选择西文字体而中文槽位未选择
- **THEN** 组合栈在西文字体之后使用默认中文字体栈

#### Scenario: 只选择中文字体

- **WHEN** 用户只选择中文字体而西文槽位未选择
- **THEN** 组合栈在默认西文字体栈之后追加该中文字体

#### Scenario: 西文字体包含中文字形

- **WHEN** 用户选择的西文字体自身包含某个中文字形
- **THEN** 该中文字形 MAY 由西文字体渲染，系统不因此报错或改写字体设置

### Requirement: 默认西文与默认中文栈

系统 SHALL 维护独立的默认西文字体栈和默认中文字体栈，并把项目默认 `fontFamily` 定义为西文默认在前、中文默认在后、末尾为 `sans-serif`。默认值 SHALL 只用于新建样式和“系统默认”恢复；加载旧项目时 MUST NOT 用新默认值覆盖已保存的 `fontFamily`。

#### Scenario: 新建样式

- **WHEN** 用户创建新的分类块或自由文字
- **THEN** 其字体使用西文默认在前、中文默认在后的组合栈

#### Scenario: 旧项目不迁移

- **WHEN** 用户加载一个已保存 `fontFamily` 的旧项目
- **THEN** 系统保留原 `fontFamily`，不自动替换为新的默认栈

#### Scenario: 恢复两个槽位

- **WHEN** 用户在西文和中文槽位都选择“系统默认”
- **THEN** 当前样式恢复为新的默认组合栈
