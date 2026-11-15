'use strict';

/*
 * js/zip.js 的 ZIP 结构与 CRC 回归。
 * 运行：node --test scripts/checks/zip.test.js
 *
 * zip.js 只做“存储模式”打包（无压缩），因此这里直接解析字节：
 * 本地文件头、中央目录、EOCD 与 CRC32。若本机有 unzip，再用 `unzip -t`
 * 做一次外部校验；没有 unzip 时仅跳过该子断言，Node 侧的解析仍然执行。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync, execFileSync } = require('node:child_process');

const { load } = require('./loader.js');

const L = load();
const zip = L.zip;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function bytesOf(text) {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

async function blobBytes(blob) {
  return Buffer.from(new Uint8Array(await blob.arrayBuffer()));
}

function eocdOffset(buf) {
  for (let offset = buf.length - 22; offset >= 0; offset -= 1) {
    if (buf.readUInt32LE(offset) === SIG_EOCD) return offset;
  }
  throw new Error('找不到 EOCD 记录');
}

function parseZip(buf) {
  const eocd = eocdOffset(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  let cursor = cdOffset;

  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(cursor), SIG_CENTRAL, '中央目录签名');
    const flags = buf.readUInt16LE(cursor + 8);
    const method = buf.readUInt16LE(cursor + 10);
    const time = buf.readUInt16LE(cursor + 12);
    const date = buf.readUInt16LE(cursor + 14);
    const crc = buf.readUInt32LE(cursor + 16);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    assert.equal(buf.readUInt32LE(localOffset), SIG_LOCAL, name + ' 的本地文件头签名');
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const localName = buf.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength);
    assert.equal(localName, name, '本地头与中央目录的文件名一致');
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = buf.subarray(dataOffset, dataOffset + compressedSize);

    entries.push({
      name: name,
      flags: flags,
      method: method,
      time: time,
      date: date,
      crc: crc,
      compressedSize: compressedSize,
      uncompressedSize: uncompressedSize,
      localOffset: localOffset,
      data: data
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return {
    eocd: eocd,
    count: count,
    cdSize: cdSize,
    cdOffset: cdOffset,
    entries: entries,
    cdEnd: cursor
  };
}

test('crc32：标准校验向量与空数据', function () {
  assert.equal(zip.crc32(bytesOf('123456789')), 0xcbf43926);
  assert.equal(zip.crc32(new Uint8Array(0)), 0);
  assert.equal(zip.crc32(bytesOf('hello')), zlib.crc32('hello'));
});

test('build：空条目列表报错', async function () {
  await assert.rejects(function () {
    return zip.build([]);
  }, /没有可打包的文件/);
});

test('build：本地文件头、中央目录与 EOCD 结构正确', async function () {
  const payload = zlib.crc32('hello');
  const zipBlob = await zip.build([
    { name: 'a.txt', blob: new Blob(['hello']) },
    { name: 'dir/', blob: new Blob([]) },
    { name: '目录/b.bin', blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])]) }
  ]);

  assert.equal(zipBlob.type, 'application/zip');
  const buf = await blobBytes(zipBlob);
  const parsed = parseZip(buf);

  assert.equal(parsed.count, 3);
  assert.deepEqual(parsed.entries.map(function (entry) { return entry.name; }), [
    'a.txt',
    'dir/',
    '目录/b.bin'
  ]);

  // 第一个条目：存储模式、UTF-8 标志、CRC 与尺寸。
  const first = parsed.entries[0];
  assert.equal(first.method, 0);
  assert.equal(first.flags & 0x0800, 0x0800);
  assert.equal(first.crc, payload);
  assert.equal(first.compressedSize, 5);
  assert.equal(first.uncompressedSize, 5);
  assert.equal(first.data.toString('utf8'), 'hello');
  assert.equal(zlib.crc32(first.data), first.crc);

  // 目录条目允许空内容。
  const dir = parsed.entries[1];
  assert.equal(dir.uncompressedSize, 0);
  assert.equal(dir.compressedSize, 0);
  assert.equal(dir.data.length, 0);
  assert.equal(dir.crc, 0);

  // 非 ASCII 文件名按 UTF-8 写入，内容 CRC 与数据一致。
  const nested = parsed.entries[2];
  assert.equal(nested.data.toString('hex'), '0102030405');
  assert.equal(nested.crc, zlib.crc32(nested.data));

  // 中央目录紧跟在文件数据之后，EOCD 的计数/偏移自洽。
  assert.equal(parsed.entries[0].localOffset, 0);
  assert.ok(parsed.entries[1].localOffset > parsed.entries[0].localOffset);
  assert.ok(parsed.entries[2].localOffset > parsed.entries[1].localOffset);
  assert.equal(parsed.cdEnd, parsed.cdOffset + parsed.cdSize);
  assert.equal(parsed.cdOffset + parsed.cdSize, parsed.eocd);

  // 时间/日期字段处于 DOS 时间可表示范围（1980-2107）。
  parsed.entries.forEach(function (entry) {
    const year = 1980 + ((entry.date >> 9) & 0x7f);
    assert.ok(year >= 1980 && year <= 2107);
  });
});

test('build：单文件条目也能被解析', async function () {
  const zipBlob = await zip.build([{ name: 'only.txt', blob: new Blob(['x']) }]);
  const parsed = parseZip(await blobBytes(zipBlob));
  assert.equal(parsed.count, 1);
  assert.equal(parsed.entries[0].name, 'only.txt');
  assert.equal(parsed.entries[0].data.toString('utf8'), 'x');
});

test('build：产物通过 unzip -t（本机无 unzip 时跳过）', async function (t) {
  const probe = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    t.skip('本机没有可用的 unzip');
    return;
  }

  const zipBlob = await zip.build([
    { name: 'a.txt', blob: new Blob(['hello']) },
    { name: 'dir/', blob: new Blob([]) },
    { name: '目录/b.bin', blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])]) }
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listify-zip-'));
  const file = path.join(dir, 'test.zip');
  try {
    fs.writeFileSync(file, await blobBytes(zipBlob));
    const output = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    assert.match(output, /No errors detected/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
