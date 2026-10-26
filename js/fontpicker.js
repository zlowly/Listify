(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const ui = L.ui;

  let cache = null;

  function isSupported() {
    return (typeof window.queryLocalFonts === 'function') ||
      (typeof navigator !== 'undefined' && typeof navigator.queryLocalFonts === 'function');
  }

  function getQuery() {
    if (typeof window.queryLocalFonts === 'function') {
      return window.queryLocalFonts.bind(window);
    }
    if (typeof navigator !== 'undefined' && typeof navigator.queryLocalFonts === 'function') {
      return navigator.queryLocalFonts.bind(navigator);
    }
    return null;
  }

  function quoteFamily(family) {
    const value = String(family == null ? '' : family).replace(/[\r\n\f]/g, ' ');
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function makeCollator() {
    try {
      return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    } catch (error) {
      return null;
    }
  }

  const collator = makeCollator();

  function normalize(fonts) {
    const byFamily = Object.create(null);
    const families = [];
    let faces = 0;

    (fonts || []).forEach(function (font) {
      faces += 1;
      if (!font) return;

      const family = String(font.family || font.fullName || font.postscriptName || '').trim();
      if (!family) return;

      const key = family.toLocaleLowerCase();
      let entry = byFamily[key];
      if (!entry) {
        entry = {
          family: family,
          fullName: font.fullName || '',
          postscriptName: font.postscriptName || '',
          faces: 0
        };
        byFamily[key] = entry;
        families.push(entry);
      }
      entry.faces += 1;
    });

    families.sort(function (a, b) {
      if (collator) return collator.compare(a.family, b.family);
      return a.family.localeCompare(b.family);
    });

    return { families: families, faces: faces };
  }

  function matches(font, query) {
    if (!query) return true;
    const haystack = [font.family, font.fullName, font.postscriptName].join('\n').toLocaleLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function errorMessage(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return '未获得本机字体访问权限。请在浏览器地址栏的站点设置中允许后点“重新获取”，或直接手输字体族。';
    }
    const detail = (error && error.message) || error || '未知错误';
    return '读取本机字体失败：' + detail + '。可点“重新获取”，或直接手输字体族。';
  }

  function open(options) {
    if (!isSupported()) {
      if (ui && ui.toast) ui.toast('当前浏览器不支持本机字体选择，请直接输入字体族。');
      return;
    }

    const opts = options || {};
    const currentValue = opts.currentValue || '';
    let closed = false;
    let requestSeq = 0;
    let loading = false;
    let failed = '';
    let currentFamilies = cache ? cache.families : [];
    let currentFaces = cache ? cache.faces : 0;

    const body = document.createElement('div');
    body.className = 'font-picker';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'input font-picker-search';
    search.placeholder = '搜索字体族、全名或 PostScript 名';
    search.setAttribute('aria-label', '搜索本机字体');

    const status = document.createElement('div');
    status.className = 'font-picker-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const hint = document.createElement('p');
    hint.className = 'hint font-picker-hint';
    hint.textContent = '只读取本机字体，不上传；选择会替换当前字体栈，可随时手输恢复。';

    const list = document.createElement('div');
    list.className = 'font-picker-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '本机字体');

    body.appendChild(search);
    body.appendChild(status);
    body.appendChild(hint);
    body.appendChild(list);

    let modal = null;
    let reloadButton = null;

    function setStatus(text, kind) {
      status.textContent = text;
      status.className = 'font-picker-status' + (kind ? ' is-' + kind : '');
    }

    function choose(value) {
      if (closed) return;
      if (opts.onPick) opts.onPick(value);
      if (modal) modal.close();
    }

    function appendRow(label, value, previewFamily, title) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'font-row';
      row.setAttribute('role', 'option');
      const selected = currentValue === value;
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) row.classList.add('is-active');

      const name = document.createElement('span');
      name.className = 'font-row-name';
      name.textContent = label;
      if (title) name.title = title;

      const preview = document.createElement('span');
      preview.className = 'font-preview';
      preview.textContent = '歌单 Playlist 123';
      preview.style.fontFamily = previewFamily;

      row.appendChild(name);
      row.appendChild(preview);
      row.addEventListener('click', function () { choose(value); });
      list.appendChild(row);
    }

    function renderList() {
      list.innerHTML = '';
      appendRow('系统默认', model.DEFAULT_FONT, model.DEFAULT_FONT, '项目默认字体栈');

      const query = search.value.trim().toLocaleLowerCase();
      const filtered = query ? currentFamilies.filter(function (font) {
        return matches(font, query);
      }) : currentFamilies;

      filtered.forEach(function (font) {
        appendRow(font.family, quoteFamily(font.family) + ', sans-serif',
          quoteFamily(font.family) + ', sans-serif', font.family);
      });

      if (loading) {
        setStatus('正在读取本机字体…', 'loading');
      } else if (failed) {
        setStatus(failed, 'error');
      } else if (!currentFamilies.length) {
        setStatus('没有找到可用字体。可能未授权，或系统没有可用字体。可点“重新获取”，或直接手输字体族。', 'empty');
      } else if (query && !filtered.length) {
        setStatus('没有匹配的字体，试试其它关键词。', 'empty');
      } else {
        setStatus(currentFamilies.length + ' 个字体族 · ' + currentFaces + ' 个字面');
      }
    }

    function finishLoad() {
      loading = false;
      if (reloadButton) reloadButton.disabled = false;
      renderList();
    }

    function load(force) {
      if (loading) return;
      if (!force && cache) {
        currentFamilies = cache.families;
        currentFaces = cache.faces;
        failed = '';
        renderList();
        return;
      }

      loading = true;
      failed = '';
      const seq = ++requestSeq;
      renderList();
      if (reloadButton) reloadButton.disabled = true;

      let query;
      try {
        query = getQuery();
      } catch (error) {
        failed = errorMessage(error);
        finishLoad();
        return;
      }

      if (!query) {
        failed = '当前浏览器不支持本机字体选择，可继续手输字体族。';
        finishLoad();
        return;
      }

      let promise;
      try {
        // 必须在点击处理函数的同步段调用，await 之后会丢失用户手势。
        promise = query();
      } catch (error) {
        failed = errorMessage(error);
        finishLoad();
        return;
      }

      Promise.resolve(promise).then(function (fonts) {
        const result = normalize(fonts);
        if (seq !== requestSeq || closed) return;
        cache = result;
        currentFamilies = result.families;
        currentFaces = result.faces;
        failed = '';
        finishLoad();
      }).catch(function (error) {
        if (seq !== requestSeq || closed) return;
        failed = errorMessage(error);
        finishLoad();
      });
    }

    modal = ui.modal.open({
      title: '选择本机字体',
      width: '560px',
      body: body,
      onClose: function () {
        closed = true;
        requestSeq += 1;
      },
      actions: [
        { label: '关闭', onClick: function (close) { close(); } },
        {
          label: '重新获取',
          className: 'btn-primary',
          onClick: function (close, button) {
            reloadButton = button;
            load(true);
          }
        }
      ]
    });

    reloadButton = modal.footer.querySelector('.btn-primary');
    modal.root.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (modal) modal.close();
    });
    search.addEventListener('input', renderList);
    load(false);
    search.focus();
  }

  L.fontPicker = {
    isSupported: isSupported,
    quoteFamily: quoteFamily,
    open: open
  };
})();
