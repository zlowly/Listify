'use strict';

/*
 * js/playlist-check.js 的纯逻辑回归。
 * 运行：node --test scripts/checks/playlist-check.test.js
 *
 * 只覆盖查重键、索引、重复分组、冲突定位与文案；不涉及 DOM、canvas 或编辑器交互。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');

const runtime = loader.createRuntime({ scripts: ['js/playlist-check.js'] });
const check = runtime.Listify.playlistCheck;
const plain = loader.toPlain;

test('查重键：去除首尾空白，空值归一为空串', function () {
  assert.equal(check.key('  晴天  '), '晴天');
  assert.equal(check.key(''), '');
  assert.equal(check.key(null), '');
  assert.equal(check.key(undefined), '');
});

test('索引：每个歌名指向第一次出现的位置，跳过空歌名', function () {
  const index = check.index([
    { name: '流行', songs: ['晴天', ' 稻香 ', ''] },
    { name: '摇滚', songs: ['晴天', '后来'] }
  ]);

  assert.equal(index.size, 3);
  assert.deepEqual(plain(index.get('晴天')), { category: '流行', categoryIndex: 0, songIndex: 0 });
  assert.deepEqual(plain(index.get('稻香')), { category: '流行', categoryIndex: 0, songIndex: 1 });
  assert.deepEqual(plain(index.get('后来')), { category: '摇滚', categoryIndex: 1, songIndex: 1 });
  assert.equal(index.has(''), false);
});

test('分析：没有重复时返回空分组', function () {
  const result = check.analyze([
    { name: '流行', songs: ['晴天', '稻香'] },
    { name: '摇滚', songs: ['后来'] }
  ]);

  assert.deepEqual(plain(result.groups), []);
  assert.equal(result.groupCount, 0);
  assert.equal(result.cellCount, 0);
  assert.deepEqual(plain(result.byCell), {});
});

test('分析：两处重复互指，并给出所在分类与序号', function () {
  const result = check.analyze([
    { name: ' 流行 ', songs: ['晴天', '稻香'] },
    { name: '摇滚', songs: ['后来', '晴天'] }
  ]);

  assert.equal(result.groupCount, 1);
  assert.equal(result.cellCount, 2);
  assert.equal(result.groups[0].song, '晴天');
  assert.deepEqual(plain(result.groups[0].occurrences), [
    { category: '流行', categoryIndex: 0, songIndex: 0 },
    { category: '摇滚', categoryIndex: 1, songIndex: 1 }
  ]);
  assert.deepEqual(plain(result.byCell['0:0']), { groupIndex: 0, occurrenceIndex: 0 });
  assert.deepEqual(plain(result.byCell['1:1']), { groupIndex: 0, occurrenceIndex: 1 });
  assert.equal(check.cellMessage(result.groups[0], 0), '与「摇滚」第 2 首同名');
  assert.equal(check.cellMessage(result.groups[0], 1), '与「流行」第 1 首同名');
});

test('分析：三处重复时每格指向下一处，第三处回到第一处', function () {
  const result = check.analyze([
    { name: '流行', songs: ['晴天'] },
    { name: '摇滚', songs: ['晴天'] },
    { name: '民谣', songs: ['晴天'] }
  ]);
  const group = result.groups[0];

  assert.equal(group.occurrences.length, 3);
  assert.equal(check.cellMessage(group, 0), '与「摇滚」第 1 首同名');
  assert.equal(check.cellMessage(group, 1), '与「民谣」第 1 首同名');
  assert.equal(check.cellMessage(group, 2), '与「流行」第 1 首同名');
});

test('分析：同分类内重名只列一次分类，大小写不同不算重复', function () {
  const sameCategory = check.analyze([{ name: '流行', songs: ['晴天', '晴天'] }]);
  assert.equal(check.groupMessage(sameCategory.groups[0]), '晴天（流行）');

  const caseDiff = check.analyze([{ name: '英文', songs: ['Hello', 'hello'] }]);
  assert.equal(caseDiff.groupCount, 0);
});

test('分析：空歌名与 # 开头的歌名不参与重复分组', function () {
  const result = check.analyze([
    { name: '混合', songs: ['', '   ', '#标签', '#标签'] }
  ]);
  assert.equal(result.groupCount, 0);
});

test('文案：摘要与改名提示与规格一致', function () {
  const result = check.analyze([
    { name: '流行', songs: ['晴天'] },
    { name: '摇滚', songs: ['晴天', '后来'] },
    { name: '未分类', songs: ['后来'] }
  ]);

  assert.equal(
    check.summary(result.groups),
    '2 首歌名重复：晴天（流行 / 摇滚）、后来（摇滚 / 未分类）'
  );
  assert.equal(check.summary([]), '');
  assert.equal(
    check.HINT,
    '相同歌名不会被自动修改。如要同时保留，请在歌名后加上歌手等信息（如「晴天 - 周杰伦」）。'
  );
});

test('分析：空分类数组与缺失 songs 不抛错', function () {
  assert.equal(check.analyze([]).groupCount, 0);
  assert.equal(check.analyze([{ name: '空分类' }]).groupCount, 0);
  assert.equal(check.analyze([null]).groupCount, 0);
});

test('装载器：index.html 在 model 之后、layout 之前加载 playlist-check', function () {
  const full = loader.load();
  assert.equal(typeof full.playlistCheck, 'object');

  const position = loader.RUNTIME_SCRIPTS.indexOf('js/playlist-check.js');
  assert.ok(position !== -1);
  assert.ok(position > loader.RUNTIME_SCRIPTS.indexOf('js/model.js'));
  assert.ok(position < loader.RUNTIME_SCRIPTS.indexOf('js/layout.js'));
});
