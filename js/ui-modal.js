(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const ui = L.ui = L.ui || {};

  const esc = ui.esc;

  /* ---------- modal ---------- */
  let modalSeq = 0;

  function isOutside(dialog, x, y) {
    const rect = dialog.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  }

  ui.modal = {
    open: function (options) {
      const root = ui.els.modalRoot;
      root.innerHTML = '';
      root.hidden = false;

      const dialog = document.createElement('dialog');
      dialog.className = 'modal';
      dialog.setAttribute('tabindex', '-1');
      const seq = ++modalSeq;
      const titleId = 'modal-title-' + seq;
      const bodyId = 'modal-body-' + seq;
      dialog.setAttribute('aria-labelledby', titleId);
      if (options.role) dialog.setAttribute('role', options.role);
      if (options.width) dialog.style.width = options.width;

      const header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = '<div class="modal-title" id="' + titleId + '">' + esc(options.title || '') + '</div>' +
        '<button class="modal-close" type="button" aria-label="关闭">×</button>';
      const body = document.createElement('div');
      body.className = 'modal-body';
      body.id = bodyId;
      if (typeof options.body === 'string') body.innerHTML = options.body;
      else if (options.body) body.appendChild(options.body);
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      if (options.role === 'alertdialog') dialog.setAttribute('aria-describedby', bodyId);
      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      root.appendChild(dialog);

      const previousFocus = document.activeElement;
      let closed = false;

      function teardown() {
        root.hidden = true;
        root.innerHTML = '';
        if (previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
          const active = document.activeElement;
          if (!active || active === document.body || dialog.contains(active)) previousFocus.focus();
        }
        if (options.onClose) options.onClose();
      }

      function close(force) {
        if (closed) return;
        if (force !== true && typeof options.beforeClose === 'function' && options.beforeClose() === false) {
          return;
        }
        closed = true;
        if (dialog.open) dialog.close();
        teardown();
      }

      dialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        close();
      });

      let downOutside = false;
      dialog.addEventListener('pointerdown', function (event) {
        downOutside = isOutside(dialog, event.clientX, event.clientY);
      });
      dialog.addEventListener('click', function (event) {
        const outside = isOutside(dialog, event.clientX, event.clientY);
        if (downOutside && outside) close();
        downOutside = false;
      });

      header.querySelector('.modal-close').addEventListener('click', function () { close(); });

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

      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');

      const primaryAction = footer.querySelector('.btn-primary');
      if (primaryAction && typeof primaryAction.focus === 'function') primaryAction.focus();

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
          role: 'alertdialog',
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
          role: 'alertdialog',
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
