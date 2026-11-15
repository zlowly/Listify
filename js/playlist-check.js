'use strict';

/*
 * 歌名查重与冲突定位的唯一实现。
 *
 * 导入的追加计划与歌单编辑器都调用这里，避免两处各写一份扫描逻辑后
 * 在 trim、大小写、忽略空值等边界上产生不同结果。模块保持纯逻辑：
 * 不读 DOM、不碰 canvas、不访问浏览器存储，可直接在 Node 回归中加载。
 */

(function () {
  const L = window.Listify = window.Listify || {};

  const HINT = '相同歌名不会被自动修改。如要同时保留，请在歌名后加上歌手等信息（如「晴天 - 周杰伦」）。';

  function key(song) {
    return String(song == null ? '' : song).trim();
  }

  // 多重集比较：同名数量差才是真实增删改，换序不产生差异。
  function diffSongs(original, next) {
    const counts = new Map();
    (original || []).forEach(function (song) {
      const songKey = key(song);
      counts.set(songKey, (counts.get(songKey) || 0) + 1);
    });
    let added = 0;
    (next || []).forEach(function (song) {
      const songKey = key(song);
      const remaining = counts.get(songKey) || 0;
      if (remaining > 0) counts.set(songKey, remaining - 1);
      else added += 1;
    });
    let removed = 0;
    counts.forEach(function (remaining) { removed += remaining; });
    const modified = Math.min(added, removed);
    return { modified: modified, added: added - modified, removed: removed - modified };
  }

  function countSongChanges(original, next) {
    const diff = diffSongs(original, next);
    return diff.modified + diff.added + diff.removed;
  }

  // 一次遍历建立“查重键 -> 第一次出现位置”的索引。
  // 追加导入用它判断某个歌名是否已存在于项目；后出现的同名歌不会覆盖先出现的位置。
  function index(categories) {
    const found = new Map();
    const list = Array.isArray(categories) ? categories : [];
    list.forEach(function (category, categoryIndex) {
      const name = String(category && category.name != null ? category.name : '').trim();
      const songs = category && Array.isArray(category.songs) ? category.songs : [];
      songs.forEach(function (song, songIndex) {
        const songKey = key(song);
        if (!songKey || found.has(songKey)) return;
        found.set(songKey, {
          category: name,
          categoryIndex: categoryIndex,
          songIndex: songIndex
        });
      });
    });
    return found;
  }

  // 返回重复歌名分组以及“单元格 -> 分组”的定位表。
  // 空歌名与 # 开头的歌名由编辑器当作其他错误处理，不参与重复分组。
  function analyze(categories) {
    const list = Array.isArray(categories) ? categories : [];
    const occurrencesByKey = new Map();

    list.forEach(function (category, categoryIndex) {
      const name = String(category && category.name != null ? category.name : '').trim() || '未命名';
      const songs = category && Array.isArray(category.songs) ? category.songs : [];
      songs.forEach(function (song, songIndex) {
        const songKey = key(song);
        if (!songKey || songKey.charAt(0) === '#') return;
        if (!occurrencesByKey.has(songKey)) occurrencesByKey.set(songKey, []);
        occurrencesByKey.get(songKey).push({
          category: name,
          categoryIndex: categoryIndex,
          songIndex: songIndex
        });
      });
    });

    const groups = [];
    const byCell = Object.create(null);
    occurrencesByKey.forEach(function (occurrences, songKey) {
      if (occurrences.length < 2) return;
      const groupIndex = groups.length;
      groups.push({ song: songKey, occurrences: occurrences });
      occurrences.forEach(function (occurrence, occurrenceIndex) {
        byCell[occurrence.categoryIndex + ':' + occurrence.songIndex] = {
          groupIndex: groupIndex,
          occurrenceIndex: occurrenceIndex
        };
      });
    });

    return {
      groups: groups,
      byCell: byCell,
      groupCount: groups.length,
      cellCount: groups.reduce(function (total, group) {
        return total + group.occurrences.length;
      }, 0)
    };
  }

  // 指向同组中的下一处，保证提示不会指向自己；两处重复时互指。
  function cellMessage(group, occurrenceIndex) {
    if (!group || !Array.isArray(group.occurrences) || group.occurrences.length < 2) return '';
    const current = Math.max(0, Math.min(group.occurrences.length - 1, Number(occurrenceIndex) || 0));
    const target = group.occurrences[(current + 1) % group.occurrences.length];
    return '与「' + target.category + '」第 ' + (target.songIndex + 1) + ' 首同名';
  }

  function groupMessage(group) {
    if (!group || !Array.isArray(group.occurrences)) return '';
    const categories = [];
    group.occurrences.forEach(function (occurrence) {
      if (categories.indexOf(occurrence.category) === -1) categories.push(occurrence.category);
    });
    return group.song + '（' + categories.join(' / ') + '）';
  }

  function summary(groups) {
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) return '';
    return list.length + ' 首歌名重复：' + list.map(groupMessage).join('、');
  }

  L.playlistCheck = {
    HINT: HINT,
    key: key,
    index: index,
    analyze: analyze,
    cellMessage: cellMessage,
    groupMessage: groupMessage,
    summary: summary,
    diffSongs: diffSongs,
    countSongChanges: countSongChanges
  };
})();
