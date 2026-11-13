(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  /* 按约定格式规则序列化歌单：
   * - 分类按存储顺序输出，每个分类一行 `#分类名`（“未分类”同样输出显式分类行）
   * - 歌名按存储顺序逐行输出；空分类只输出分类名行
   * - `\n` 换行，文件末尾一个换行
   * 输出的文本可由 L.importer.parseText 解析并还原出相同的分类与歌名。 */
  function serialize(categories) {
    const lines = [];
    (categories || []).forEach(function (category) {
      lines.push('#' + category.name);
      (category.songs || []).forEach(function (song) {
        lines.push(song);
      });
    });
    return lines.length ? lines.join('\n') + '\n' : '';
  }

  /* 空歌单时导出的样例模板：2 个分类、每类 4 首，全部符合格式规则。 */
  function sampleTemplate() {
    return [
      '#流行',
      '夜曲',
      '晴天',
      '七里香',
      '告白气球',
      '',
      '#摇滚',
      '光辉岁月',
      '海阔天空',
      '无地自容',
      '梦的河'
    ].join('\n') + '\n';
  }

  function downloadText(text, filename) {
    L.model.downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
  }

  /* 歌单非空：序列化并下载 歌单.txt，返回 { empty: false, text }；
   * 歌单为空：不下载，返回 { empty: true }，由调用方做模板引导。 */
  function exportPlaylist(project) {
    const categories = (project && project.playlist && project.playlist.categories) || [];
    if (!categories.length) return { empty: true };
    const text = serialize(categories);
    downloadText(text, '歌单.txt');
    return { empty: false, text: text };
  }

  function downloadTemplate() {
    downloadText(sampleTemplate(), '歌单模板.txt');
  }

  L.playlistExport = {
    serialize: serialize,
    sampleTemplate: sampleTemplate,
    exportPlaylist: exportPlaylist,
    downloadTemplate: downloadTemplate
  };
})();
