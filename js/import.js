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

  function copyCategories(categories) {
    return (categories || []).map(function (category) {
      return { name: category.name, songs: (category.songs || []).slice() };
    });
  }

  function planReplace(project, categories) {
    const rec = reconcile(project, categories);
    const oldByName = new Map(project.playlist.categories.map(function (category) {
      return [category.name, category];
    }));
    const newByName = new Map(categories.map(function (category) {
      return [category.name, category];
    }));
    const songUpdates = [];
    let updateCount = 0;

    rec.kept.forEach(function (name) {
      const before = oldByName.get(name);
      const after = newByName.get(name);
      const count = L.playlistCheck.countSongChanges(
        before ? before.songs : [],
        after ? after.songs : []
      );
      if (!count) return;
      songUpdates.push({ name: name, count: count });
      updateCount += count;
    });
    const updatedNames = new Set(songUpdates.map(function (item) { return item.name; }));

    return {
      mode: 'replace',
      categories: copyCategories(categories),
      addedCategoryNames: rec.added.slice(),
      removedCategoryNames: rec.removed.slice(),
      unchangedCategoryNames: rec.kept.filter(function (name) {
        return !updatedNames.has(name);
      }),
      mergedCategories: [],
      skipped: [],
      songUpdates: songUpdates,
      stats: {
        newCategories: rec.added.length,
        addedSongs: categories.reduce(function (total, category) {
          return total + (category.songs || []).length;
        }, 0),
        skippedSongs: 0,
        songUpdates: updateCount
      }
    };
  }

  function planAppend(project, categories) {
    const existing = project.playlist.categories || [];
    const planned = copyCategories(existing);
    const byName = new Map();
    planned.forEach(function (category, index) {
      byName.set(category.name, { category: category, index: index });
    });

    const index = L.playlistCheck.index(existing);
    const addedCategoryNames = [];
    const mergedCategories = [];
    const skipped = [];
    let addedSongs = 0;
    let skippedSongs = 0;

    (categories || []).forEach(function (fileCategory) {
      let slot = byName.get(fileCategory.name);
      const isNew = !slot;
      if (isNew) {
        const created = { name: fileCategory.name, songs: [] };
        planned.push(created);
        slot = { category: created, index: planned.length - 1 };
        byName.set(fileCategory.name, slot);
        addedCategoryNames.push(fileCategory.name);
      }

      let categoryAdded = 0;
      let categorySkipped = 0;
      (fileCategory.songs || []).forEach(function (song) {
        const songKey = L.playlistCheck.key(song);
        const found = index.get(songKey);
        if (found) {
          skipped.push({ song: songKey, category: found.category });
          categorySkipped += 1;
          skippedSongs += 1;
          return;
        }
        slot.category.songs.push(song);
        index.set(songKey, {
          category: slot.category.name,
          categoryIndex: slot.index,
          songIndex: slot.category.songs.length - 1
        });
        categoryAdded += 1;
        addedSongs += 1;
      });

      if (isNew || categoryAdded > 0) {
        mergedCategories.push({
          name: slot.category.name,
          addedSongs: categoryAdded,
          skippedSongs: categorySkipped,
          isNew: isNew
        });
      }
    });

    const mergedNames = new Set(mergedCategories.map(function (item) { return item.name; }));
    const unchangedCategoryNames = existing.map(function (category) {
      return category.name;
    }).filter(function (name) {
      return !mergedNames.has(name);
    });

    return {
      mode: 'append',
      categories: planned,
      addedCategoryNames: addedCategoryNames,
      removedCategoryNames: [],
      unchangedCategoryNames: unchangedCategoryNames,
      mergedCategories: mergedCategories,
      skipped: skipped,
      songUpdates: [],
      stats: {
        newCategories: addedCategoryNames.length,
        addedSongs: addedSongs,
        skippedSongs: skippedSongs,
        songUpdates: 0
      }
    };
  }

  function planImport(project, categories, mode) {
    if (mode === 'append') return planAppend(project, categories);
    return planReplace(project, categories);
  }

  function applyImport(project, plan) {
    const isPlan = plan && !Array.isArray(plan);
    const categories = isPlan ? plan.categories : plan;
    const mode = isPlan && plan.mode === 'append' ? 'append' : 'replace';
    const names = new Set(categories.map(function (category) { return category.name; }));
    let removedBlocks = 0;

    if (mode === 'replace') {
      project.pages.forEach(function (page) {
        page.elements = page.elements.filter(function (element) {
          if (element.type === 'category' && !names.has(element.category)) {
            removedBlocks += 1;
            return false;
          }
          return true;
        });
      });
    }

    project.playlist.categories = copyCategories(categories);
    return { removedBlocks: removedBlocks };
  }

  L.importer = {
    UNCLASSIFIED: UNCLASSIFIED,
    decodeBuffer: decodeBuffer,
    parseText: parseText,
    importFile: importFile,
    reconcile: reconcile,
    planImport: planImport,
    applyImport: applyImport,
    labelForEncoding: labelForEncoding
  };
})();
