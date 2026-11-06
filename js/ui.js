// Small UI toolkit for the studio: dialogs, toasts, previews.
import { esc, icon } from './util.js';
import { db } from './db.js';

export { esc, icon };

export function toast(msg, err = false) {
  let w = document.querySelector('.toast-wrap');
  if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; w.setAttribute('role', 'status'); document.body.appendChild(w); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  w.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2600);
}

/** Open a dialog. Returns { el, close }. */
export function dialog(html, { wide = false, onClose, dismissable = true } = {}) {
  const d = document.createElement('div');
  d.className = 'dlg';
  d.innerHTML = `<div class="dlg-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${dismissable ? `<button class="btn ghost icon dlg-x" data-close aria-label="Close">${icon('close')}</button>` : ''}${html}</div>`;
  document.body.appendChild(d);
  const close = () => { d.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  document.addEventListener('keydown', onKey);
  d.addEventListener('click', (e) => { if ((e.target === d && dismissable) || e.target.closest('[data-close]')) close(); });
  setTimeout(() => d.querySelector('input:not([type=hidden]),textarea,select,button:not(.dlg-x)')?.focus(), 30);
  return { el: d, close };
}

export function confirmDlg(title, text, okLabel = 'Delete', danger = true) {
  return new Promise((res) => {
    const { el, close } = dialog(`<h2>${esc(title)}</h2><p class="dlg-sub">${esc(text)}</p><div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`, { onClose: () => res(false) });
    el.querySelector('[data-ok]').onclick = () => { res(true); el.remove(); };
  });
}

export function promptDlg(title, value = '', label = '') {
  return new Promise((res) => {
    const { el, close } = dialog(`<h2>${esc(title)}</h2><form><label class="field"><span>${esc(label)}</span><input value="${esc(value)}" required></label><div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`, { onClose: () => res(null) });
    el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = el.querySelector('input').value; el.remove(); res(v); };
  });
}

const urlCache = new Map();
export async function blobUrl(key) {
  if (!key) return null;
  if (/^(https?:|data:|blob:)/.test(key)) return key;
  if (!urlCache.has(key)) urlCache.set(key, db.getBlob(key).then(b => b ? URL.createObjectURL(b) : null));
  return urlCache.get(key);
}

/** Render a page preview (image thumb or scaled HTML) into a box element. */
export async function pagePreview(box, page, { full = false } = {}) {
  box.innerHTML = '';
  box.style.backgroundImage = '';
  if (!page) return;
  if (page.kind === 'image') {
    const u = await blobUrl(full ? page.image : (page.thumb || page.image));
    box.style.backgroundImage = u ? `url("${u}")` : '';
    if (page.fit !== 'cover') box.style.backgroundSize = '100% 100%';
  } else {
    const d = document.createElement('div');
    d.className = 'ff-html fx-static';
    d.innerHTML = page.html;
    box.appendChild(d);
    const fit = () => { const w = box.clientWidth; if (w) d.style.transform = `scale(${w / 800})`; };
    fit(); requestAnimationFrame(fit);
    new ResizeObserver(fit).observe(box);
  }
}

export function readFileText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
export function pickFiles({ accept = '*', multiple = false } = {}) {
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => res([...i.files]); i.click();
  });
}
export const timeAgo = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
