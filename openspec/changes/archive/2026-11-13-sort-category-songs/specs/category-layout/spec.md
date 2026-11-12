# Spec Delta

## MODIFIED Requirements

### Requirement: 虚拟字数排序
系统 SHALL 在排版前按歌名的虚拟字数升序稳定排序；中文/全角字符 SHALL 计 2，英文/半角字符 SHALL 计 1；相同字数 SHALL 保持歌名当前的存储顺序；排序 SHALL 作用于整个分类，再按表格顺序切分。

#### Scenario: 中英混合排序
- **WHEN** 分类内歌名为“Hello”“真的爱你”“Hi”
- **THEN** 排序结果为“Hi”“Hello”“真的爱你”

#### Scenario: 同字数稳定
- **WHEN** 两首歌虚拟字数相同
- **THEN** 它们保持排序前在歌单数据中的相对先后顺序
