'use strict';

/*
 * 草稿资产的编码回归（js/draft-store.js + js/assets.js 的合作点）。
 * 运行：node --test scripts/checks/draft-encoding.test.js
 *
 * 事故背景：草稿库的二进制分支曾把资产读成 data URL，而 buildProject 只接受
 * 纯 base64，于是任何含图片的草稿在恢复时都被判为损坏。这里锁住两件事：
 * 前缀一定被剥掉，且剥出来的东西一定能被 base64ToBlob 解码回原始字节。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');

const L = loader.load();
const draftStore = L.draftStore;
const assets = L.assets;

// 1x1 PNG 的最小字节序列（含真实 PNG 魔数），用来确认往返不丢字节
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');

test('stripDataUrlPrefix：剥掉 data URL 前缀', function () {
  assert.equal(
    draftStore.stripDataUrlPrefix('data:image/png;base64,' + PNG_BASE64),
    PNG_BASE64
  );
  assert.equal(
    draftStore.stripDataUrlPrefix('data:image/jpeg;base64,/9j/4AAQ'),
    '/9j/4AAQ'
  );
});

test('stripDataUrlPrefix：纯 base64 原样返回', function () {
  assert.equal(draftStore.stripDataUrlPrefix(PNG_BASE64), PNG_BASE64);
  assert.equal(draftStore.stripDataUrlPrefix('AAAA'), 'AAAA');
});

test('stripDataUrlPrefix：空值与非法输入返回空串', function () {
  assert.equal(draftStore.stripDataUrlPrefix(''), '');
  assert.equal(draftStore.stripDataUrlPrefix(null), '');
  assert.equal(draftStore.stripDataUrlPrefix(undefined), '');
  assert.equal(draftStore.stripDataUrlPrefix(42), '');
  assert.equal(draftStore.stripDataUrlPrefix({}), '');
});

test('stripDataUrlPrefix：内容里出现逗号但无 data: 前缀时不截断', function () {
  assert.equal(draftStore.stripDataUrlPrefix('abc,def'), 'abc,def');
});

test('剥前缀后的数据能被 base64ToBlob 解码回原始字节', async function () {
  const blob = assets.base64ToBlob(
    draftStore.stripDataUrlPrefix('data:image/png;base64,' + PNG_BASE64),
    'image/png'
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes), Array.from(PNG_BYTES));
  assert.equal(blob.type, 'image/png');
});

test('二进制记录交给 buildProject 的数据可解码（模拟草稿恢复交接）', async function () {
  // 造一个与草稿库 assetBlobs 记录等价的输入：Blob + mime
  const sourceBlob = new Blob([PNG_BYTES], { type: 'image/png' });
  // 草稿库恢复路径等价转换：data URL -> 剥前缀 -> 纯 base64
  const dataUrl = 'data:image/png;base64,' + Buffer.from(
    new Uint8Array(await sourceBlob.arrayBuffer())
  ).toString('base64');
  const handedToBuild = draftStore.stripDataUrlPrefix(dataUrl);
  const decoded = assets.base64ToBlob(handedToBuild, 'image/png');
  const bytes = new Uint8Array(await decoded.arrayBuffer());
  assert.deepEqual(Array.from(bytes), Array.from(PNG_BYTES));
  assert.equal(handedToBuild.indexOf('data:'), -1);
});
