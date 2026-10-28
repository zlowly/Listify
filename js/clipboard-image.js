(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  function read(event) {
    if (!event || !event.clipboardData) return [];
    const data = event.clipboardData;
    const images = [];

    if (data.items) {
      for (let index = 0; index < data.items.length; index += 1) {
        const item = data.items[index];
        if (!item || item.kind !== 'file' || !item.type || item.type.indexOf('image/') !== 0) continue;
        const file = item.getAsFile();
        if (!file) continue;
        images.push({
          blob: file,
          name: file.name || '',
          mime: file.type || item.type
        });
      }
    }

    // Chrome 的 files 通常由 items 派生，只在 items 没有图片时回退，避免重复。
    if (!images.length && data.files) {
      for (let index = 0; index < data.files.length; index += 1) {
        const file = data.files[index];
        if (!file || !file.type || file.type.indexOf('image/') !== 0) continue;
        images.push({
          blob: file,
          name: file.name || '',
          mime: file.type
        });
      }
    }

    return images;
  }

  function install(options) {
    const opts = options || {};

    function onPaste(event) {
      if (typeof opts.shouldHandle === 'function' && !opts.shouldHandle(event)) return;
      const images = read(event);
      if (!images.length) return;
      event.preventDefault();
      if (typeof opts.onImages === 'function') opts.onImages(images, event);
    }

    document.addEventListener('paste', onPaste);
    return function uninstall() {
      document.removeEventListener('paste', onPaste);
    };
  }

  L.clipboardImage = {
    read: read,
    install: install
  };
})();
