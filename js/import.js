(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  const UNCLASSIFIED = '未分类';

  function stripBom(text) {
    if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
    return text;
  }

  function decodeWith(buffer, encoding) {
    try {
      return {
        ok: true,
        text: stripBom(new TextDecoder(encoding, { fatal: true }).decode(buffer)),
        encoding: encoding
      };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  function decodeBuffer(buffer, overrideEncoding) {
    if (overrideEncoding) {
      const result = decodeWith(buffer, overrideEncoding);
      if (!result.ok) {
        return {
          ok: false,
          errors: ['无法按 ' + overrideEncoding + ' 解码该文件，请选择其他编码后重试。']
        };
      }
      return {
        ok: true,
        text: result.text,
        encoding: labelForEncoding(overrideEncoding)
      };
    }

    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      const result = decodeWith(buffer.slice(3), 'utf-8');
      if (result.ok) return { ok: true, text: result.text, encoding: 'UTF-8 BOM' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      const result = decodeWith(buffer.slice(2), 'utf-16le');
      if (result.ok) return { ok: true, text: result.text, encoding: 'UTF-16LE' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      const result = decodeWith(buffer.slice(2), 'utf-16be');
      if (result.ok) return { ok: true, text: result.text, encoding: 'UTF-16BE' };
    }

    const utf8 = decodeWith(buffer, 'utf-8');
    if (utf8.ok) return { ok: true, text: utf8.text, encoding: 'UTF-8' };

    const gb = decodeWith(buffer, 'gb18030');
    if (gb.ok) return { ok: true, text: gb.text, encoding: 'GB18030' };

    return {
      ok: false,
      errors: ['无法自动识别文件编码。请选择 UTF-8 或 GB18030 后重试。']
    };
  }

  function labelForEncoding(encoding) {
    const map = {
      'utf-8': 'UTF-8',
      'utf8': 'UTF-8',
      'gb18030': 'GB18030',
      'gbk': 'GB18030',
      'utf-16le': 'UTF-16LE',
      'utf-16be': 'UTF-16BE'
    };
    return map[String(encoding || '').toLowerCase()] || String(encoding || '');
  }

  function parseText(text) {
    const source = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    const categories = [];
    const byName = new Map();
    const songFirstLine = new Map();
    const errors = [];
    let current = null;
    let sawContent = false;

    function addSong(song, lineNo) {
      sawContent = true;
      if (!current) {
        if (!byName.has(UNCLASSIFIED)) {
          const unclassified = { name: UNCLASSIFIED, songs: [] };
          categories.push(unclassified);
          byName.set(UNCLASSIFIED, { category: unclassified, line: lineNo });
          current = unclassified;
        } else {
          current = byName.get(UNCLASSIFIED).category;
        }
      }
      const songLowerKey = song;
      if (songFirstLine.has(songLowerKey)) {
        const first = songFirstLine.get(songLowerKey);
        errors.push({
          line: lineNo,
          message: '第 ' + lineNo + ' 行：歌名“' + song + '”与第 ' + first.line + ' 行重复'
        });
      } else {
        songFirstLine.set(songLowerKey, { line: lineNo });
      }
      current.songs.push(song);
    }

    for (let i = 0; i < lines.length; i += 1) {
      const lineNo = i + 1;
      const line = lines[i].trim();
      if (!line) continue;
      sawContent = true;

      if (line.charAt(0) === '#') {
        const name = line.slice(1).trim();
        if (!name) {
          errors.push({ line: lineNo, message: '第 ' + lineNo + ' 行：分类名不能为空' });
          current = null;
          continue;
        }
        if (byName.has(name)) {
          const first = byName.get(name);
          errors.push({
            line: lineNo,
            message: '第 ' + lineNo + ' 行：分类“' + name + '”与第 ' + first.line + ' 行重复'
          });
          current = first.category;
          continue;
        }
        const category = { name: name, songs: [] };
        categories.push(category);
        byName.set(name, { category: category, line: lineNo });
        current = category;
      } else {
        addSong(line, lineNo);
      }
    }

    if (!sawContent) {
      errors.push({ line: 1, message: '文件中没有可导入的分类或歌名' });
    }

    return {
      ok: errors.length === 0,
      categories: errors.length === 0 ? categories : [],
      errors: errors.map(function (item) { return item.message; }),
      errorDetails: errors,
      stats: {
        categories: categories.length,
        songs: categories.reduce(function (sum, category) { return sum + category.songs.length; }, 0)
      }
    };
  }

  async function importFile(file, overrideEncoding) {
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      return { ok: false, errors: ['文件读取失败：' + err.message] };
    }
    const decoded = decodeBuffer(buffer, overrideEncoding);
    if (!decoded.ok) return decoded;
    const parsed = parseText(decoded.text);
    parsed.encoding = decoded.encoding;
    parsed.fileName = file.name;
    return parsed;
  }

  function reconcile(project, categories) {
    const oldNames = project.playlist.categories.map(function (category) { return category.name; });
    const newNames = categories.map(function (category) { return category.name; });
    const oldSet = new Set(oldNames);
    const newSet = new Set(newNames);
    return {
      added: newNames.filter(function (name) { return !oldSet.has(name); }),
      removed: oldNames.filter(function (name) { return !newSet.has(name); }),
      kept: newNames.filter(function (name) { return oldSet.has(name); }),
      oldNames: oldNames,
      newNames: newNames
    };
  }

  function applyImport(project, categories) {
    const names = new Set(categories.map(function (category) { return category.name; }));
    let removedBlocks = 0;
    project.pages.forEach(function (page) {
      const before = page.elements.length;
      page.elements = page.elements.filter(function (element) {
        if (element.type === 'category' && !names.has(element.category)) {
          removedBlocks += 1;
          return false;
        }
        return true;
      });
      if (!page.elements.length) {
        /* keep the page even if it becomes empty */
      }
      if (page.elements.length !== before && page.elements.length === 0) {
        /* no-op, explicit for readability */
      }
    });
    project.playlist.categories = categories.map(function (category) {
      return { name: category.name, songs: category.songs.slice() };
    });
    return { removedBlocks: removedBlocks };
  }

  L.importer = {
    UNCLASSIFIED: UNCLASSIFIED,
    decodeBuffer: decodeBuffer,
    parseText: parseText,
    importFile: importFile,
    reconcile: reconcile,
    applyImport: applyImport,
    labelForEncoding: labelForEncoding
  };
})();
