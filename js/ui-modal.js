(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const ui = L.ui = L.ui || {};

  const esc = ui.esc;

  /* ---------- modal ---------- */
  let modalSeq = 0;

  ui.modal = {
    open: function (options) {
      const root = ui.els.modalRoot;
      root.hidden = false;
      root.innerHTML = '';
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('tabindex', '-1');
      const titleId = 'modal-title-' + (++modalSeq);
      modal.setAttribute('aria-labelledby', titleId);
      if (options.width) modal.style.width = options.width;
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = '<div class="modal-title" id="' + titleId + '">' + esc(options.title || '') + '</div>' +
        '<button class="modal-close" type="button" aria-label="关闭">×</button>';
      const body = document.createElement('div');
      body.className = 'modal-body';
      if (typeof options.body === 'string') body.innerHTML = options.body;
      else if (options.body) body.appendChild(options.body);
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      root.appendChild(modal);

      const previousFocus = document.activeElement;
      let closed = false;
      function close(force) {
        if (closed) return;
        if (force !== true && typeof options.beforeClose === 'function' && options.beforeClose() === false) {
          return;
        }
        closed = true;
        root.hidden = true;
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        root.removeEventListener('click', onBackdrop);
        if (previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
          previousFocus.focus();
        }
        if (options.onClose) options.onClose();
      }
      function focusableList() {
        return Array.prototype.filter.call(
          modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
          function (el) { return !el.disabled && el.offsetParent !== null; }
        );
      }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== 'Tab') return;
        const list = focusableList();
        if (!list.length) {
          event.preventDefault();
          modal.focus();
          return;
        }
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || !modal.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !modal.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
      function onBackdrop(event) {
        if (event.target === root) close();
      }
      document.addEventListener('keydown', onKey);
      header.querySelector('.modal-close').addEventListener('click', function () { close(); });
      root.addEventListener('click', onBackdrop);

      (options.actions || []).forEach(function (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn ' + (action.className || '');
        button.textContent = action.label;
        button.addEventListener('click', function () {
          if (action.onClick) action.onClick(close, button);
          else close();
        });
        footer.appendChild(button);
      });
      const primaryAction = footer.querySelector('.btn-primary');
      const initialFocus = primaryAction || focusableList()[0] || modal;
      if (initialFocus && typeof initialFocus.focus === 'function') initialFocus.focus();
      return { close: close, body: body, footer: footer, root: root };
    },

    alert: function (title, message) {
      return new Promise(function (resolve) {
        let settled = false;
        let closeFn;
        function finish() {
          if (settled) return;
          settled = true;
          closeFn();
          resolve();
        }
        const modal = ui.modal.open({
          title: title,
          body: '<p>' + esc(message).replace(/\n/g, '<br>') + '</p>',
          onClose: finish,
          actions: [{ label: '确定', className: 'btn-primary', onClick: finish }]
        });
        closeFn = modal.close;
      });
    },

    confirm: function (title, message, options) {
      return new Promise(function (resolve) {
        let settled = false;
        let closeFn;
        function finish(value) {
          if (settled) return;
          settled = true;
          closeFn();
          resolve(value);
        }
        const modal = ui.modal.open({
          title: title,
          body: '<p>' + esc(message).replace(/\n/g, '<br>') + '</p>',
          onClose: function () { finish(false); },
          actions: [
            { label: '取消', onClick: function () { finish(false); } },
            {
              label: (options && options.confirmLabel) || '确定',
              className: (options && options.danger) ? 'btn-danger' : 'btn-primary',
              onClick: function () { finish(true); }
            }
          ]
        });
        closeFn = modal.close;
      });
    }
  };
})();
