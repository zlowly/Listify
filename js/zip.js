(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  let crcTable = null;

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    const time = ((hours & 0x1F) << 11) | ((minutes & 0x3F) << 5) | (seconds & 0x1F);
    const dateValue = (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F);
    return { time: time, date: dateValue };
  }

  function writeU16(view, offset, value) {
    view.setUint16(offset, value & 0xFFFF, true);
  }

  function writeU32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function localHeader(nameBytes, crc, size, dt) {
    const buffer = new ArrayBuffer(30 + nameBytes.length);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    writeU32(view, 0, 0x04034B50);
    writeU16(view, 4, 20);
    writeU16(view, 6, 0x0800);
    writeU16(view, 8, 0);
    writeU16(view, 10, dt.time);
    writeU16(view, 12, dt.date);
    writeU32(view, 14, crc);
    writeU32(view, 18, size);
    writeU32(view, 22, size);
    writeU16(view, 26, nameBytes.length);
    writeU16(view, 28, 0);
    bytes.set(nameBytes, 30);
    return bytes;
  }

  function centralHeader(nameBytes, crc, size, dt, offset) {
    const buffer = new ArrayBuffer(46 + nameBytes.length);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    writeU32(view, 0, 0x02014B50);
    writeU16(view, 4, 20);
    writeU16(view, 6, 20);
    writeU16(view, 8, 0x0800);
    writeU16(view, 10, 0);
    writeU16(view, 12, dt.time);
    writeU16(view, 14, dt.date);
    writeU32(view, 16, crc);
    writeU32(view, 20, size);
    writeU32(view, 24, size);
    writeU16(view, 28, nameBytes.length);
    writeU16(view, 30, 0);
    writeU16(view, 32, 0);
    writeU16(view, 34, 0);
    writeU16(view, 36, 0);
    writeU32(view, 38, 0);
    writeU32(view, 42, offset);
    bytes.set(nameBytes, 46);
    return bytes;
  }

  function endOfCentralDirectory(count, size, offset) {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    writeU32(view, 0, 0x06054B50);
    writeU16(view, 4, 0);
    writeU16(view, 6, 0);
    writeU16(view, 8, count);
    writeU16(view, 10, count);
    writeU32(view, 12, size);
    writeU32(view, 16, offset);
    writeU16(view, 20, 0);
    return new Uint8Array(buffer);
  }

  async function build(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('没有可打包的文件');
    }
    if (entries.length > 65535) {
      throw new Error('文件数量超过 ZIP 上限');
    }
    const encoder = new TextEncoder();
    const dt = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const data = new Uint8Array(await entry.blob.arrayBuffer());
      const nameBytes = encoder.encode(entry.name);
      const crc = crc32(data);
      const header = localHeader(nameBytes, crc, data.length, dt);
      parts.push(header, data);
      central.push(centralHeader(nameBytes, crc, data.length, dt, offset));
      offset += header.length + data.length;
    }

    let centralSize = 0;
    central.forEach(function (part) {
      centralSize += part.length;
    });
    const centralOffset = offset;
    central.forEach(function (part) {
      parts.push(part);
    });
    parts.push(endOfCentralDirectory(entries.length, centralSize, centralOffset));

    return new Blob(parts, { type: 'application/zip' });
  }

  L.zip = {
    build: build,
    crc32: crc32
  };
})();
