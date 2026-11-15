'use strict';

/*
 * js/import.js 的导入计划与应用回归。
 * 运行：node --test scripts/checks/import.test.js
 *
 * 只覆盖纯逻辑：替换/追加计划、去重跳过、分类顺序与画布元素删除；
 * 不涉及文件解码、弹窗交互或真实 DOM。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');

const L = loader.load();
const importer = L.importer;
const plain = loader.toPlain;

function makeProject() {
  return {
    playlist: {
      categories: [
        { name: '流行', songs: ['晴天', '稻香'] },
        { name: '摇滚', songs: ['后来'] }
      ]
    },
    pages: [{
      elements: [
        { type: 'category', category: '流行' },
        { type: 'category', category: '摇滚' },
        { type: 'text', text: '标题' }
      ]
    }]
  };
}

test('替换计划：分类增删、歌名更新计数与统计', function () {
  const project = makeProject();
  const before = JSON.stringify(project);
  const plan = importer.planImport(project, [
    { name: '流行', songs: ['晴天', '后来'] },
    { name: '民谣', songs: ['南山南'] }
  ], 'replace');

  assert.equal(JSON.stringify(project), before, '计划不修改项目');
  assert.equal(plan.mode, 'replace');
  assert.deepEqual(plain(plan.addedCategoryNames), ['民谣']);
  assert.deepEqual(plain(plan.removedCategoryNames), ['摇滚']);
  assert.deepEqual(plain(plan.unchangedCategoryNames), []);
  assert.deepEqual(plain(plan.songUpdates), [{ name: '流行', count: 1 }]);
  assert.equal(plan.stats.newCategories, 1);
  assert.equal(plan.stats.addedSongs, 3);
  assert.equal(plan.stats.songUpdates, 1);
  assert.deepEqual(plain(plan.categories), [
    { name: '流行', songs: ['晴天', '后来'] },
    { name: '民谣', songs: ['南山南'] }
  ]);
});

test('替换应用：删除消失分类块，保留其他元素', function () {
  const project = makeProject();
  const plan = importer.planImport(project, [
    { name: '流行', songs: ['晴天', '后来'] },
    { name: '民谣', songs: ['南山南'] }
  ], 'replace');
  const result = importer.applyImport(project, plan);

  assert.equal(result.removedBlocks, 1);
  assert.deepEqual(plain(project.pages[0].elements), [
    { type: 'category', category: '流行' },
    { type: 'text', text: '标题' }
  ]);
  assert.deepEqual(plain(project.playlist.categories), [
    { name: '流行', songs: ['晴天', '后来'] },
    { name: '民谣', songs: ['南山南'] }
  ]);
});

test('追加计划：同名分类并集、新分类未放置、跳过项定位', function () {
  const plan = importer.planImport(makeProject(), [
    { name: '流行', songs: ['稻香', '七里香'] },
    { name: '新分类', songs: ['晴天', '夜曲'] }
  ], 'append');

  assert.equal(plan.mode, 'append');
  assert.deepEqual(plain(plan.categories), [
    { name: '流行', songs: ['晴天', '稻香', '七里香'] },
    { name: '摇滚', songs: ['后来'] },
    { name: '新分类', songs: ['夜曲'] }
  ]);
  assert.deepEqual(plain(plan.addedCategoryNames), ['新分类']);
  assert.deepEqual(plain(plan.mergedCategories), [
    { name: '流行', addedSongs: 1, skippedSongs: 1, isNew: false },
    { name: '新分类', addedSongs: 1, skippedSongs: 1, isNew: true }
  ]);
  assert.deepEqual(plain(plan.unchangedCategoryNames), ['摇滚']);
  assert.deepEqual(plain(plan.skipped), [
    { song: '稻香', category: '流行' },
    { song: '晴天', category: '流行' }
  ]);
  assert.equal(plan.stats.newCategories, 1);
  assert.equal(plan.stats.addedSongs, 2);
  assert.equal(plan.stats.skippedSongs, 2);
});

test('追加计划：新分类的歌名全重复时仍创建 0 首分类', function () {
  const plan = importer.planImport(makeProject(), [
    { name: '新分类', songs: ['晴天'] }
  ], 'append');

  assert.deepEqual(plain(plan.addedCategoryNames), ['新分类']);
  assert.deepEqual(plain(plan.categories), [
    { name: '流行', songs: ['晴天', '稻香'] },
    { name: '摇滚', songs: ['后来'] },
    { name: '新分类', songs: [] }
  ]);
  assert.deepEqual(plain(plan.mergedCategories), [
    { name: '新分类', addedSongs: 0, skippedSongs: 1, isNew: true }
  ]);
  assert.equal(plan.stats.addedSongs, 0);
  assert.equal(plan.stats.skippedSongs, 1);
});

test('追加计划：未分类按同名分类合并', function () {
  const project = makeProject();
  project.playlist.categories.push({ name: '未分类', songs: ['晨光'] });

  const plan = importer.planImport(project, [
    { name: '未分类', songs: ['晨光', '夜色'] }
  ], 'append');

  assert.deepEqual(plain(plan.addedCategoryNames), []);
  assert.deepEqual(plain(plan.categories), [
    { name: '流行', songs: ['晴天', '稻香'] },
    { name: '摇滚', songs: ['后来'] },
    { name: '未分类', songs: ['晨光', '夜色'] }
  ]);
  assert.deepEqual(plain(plan.skipped), [{ song: '晨光', category: '未分类' }]);
});

test('追加计划：大小写不同视为不同歌名', function () {
  const project = {
    playlist: { categories: [{ name: '英文', songs: ['Hello'] }] },
    pages: [{ elements: [] }]
  };
  const plan = importer.planImport(project, [
    { name: '英文', songs: ['hello'] }
  ], 'append');

  assert.deepEqual(plain(plan.categories), [
    { name: '英文', songs: ['Hello', 'hello'] }
  ]);
  assert.equal(plan.stats.addedSongs, 1);
  assert.equal(plan.stats.skippedSongs, 0);
});

test('追加应用：不删除任何分类块，只替换歌单数据', function () {
  const project = makeProject();
  const plan = importer.planImport(project, [
    { name: '新分类', songs: ['夜曲'] }
  ], 'append');
  const result = importer.applyImport(project, plan);

  assert.equal(result.removedBlocks, 0);
  assert.deepEqual(plain(project.pages[0].elements), [
    { type: 'category', category: '流行' },
    { type: 'category', category: '摇滚' },
    { type: 'text', text: '标题' }
  ]);
  assert.deepEqual(plain(project.playlist.categories.map(function (item) { return item.name; })),
    ['流行', '摇滚', '新分类']);
});

test('歌名变更计数：换序不算修改', function () {
  assert.equal(L.playlistCheck.countSongChanges(['A', 'B'], ['B', 'A']), 0);
  assert.equal(L.playlistCheck.countSongChanges(['A', 'B'], ['A', 'C']), 1);
});
