// FlipForge editor: pages, interactive hotspots & overlays, design, content, settings, publishing.
import { db, uid, defaultSettings } from './db.js';
import { icon, esc, toast, dialog, confirmDlg, pagePreview, pickFiles, blobUrl } from './ui.js';
import { compose, THEMES, SIZES, art } from './composer.js';
import { BLOCK_HELP } from './templates.js';
import { exportBookHtml, exportProject, download, slug } from './export.js';
import { sha256, debounce, videoEmbed } from './util.js';
import { mountViewer } from './viewer.js';
import { qrSvg } from '../vendor/qr.mjs';

const HS_TYPES = [
  ['link', 'Web link', 'link'], ['page', 'Go to page', 'page'], ['video', 'Video', 'video'], ['audio', 'Audio', 'audio'],
  ['image', 'Pop-up image', 'image'], ['gallery', 'Slideshow', 'gallery'], ['note', 'Note / tooltip', 'note'], ['quiz', 'Quiz', 'quiz'],
  ['embed', 'Embed (map, form…)', 'embed'], ['product', 'Product / cart', 'product'],
];
const OV_TYPES = [['text', 'Text', 'text'], ['shape', 'Shape', 'shape'], ['sticker', 'Image / GIF', 'sticker']];
const TYPE_NAME = Object.fromEntries([...HS_TYPES, ...OV_TYPES].map(([k, n]) => [k, n]));
const TYPE_ICON = Object.fromEntries([...HS_TYPES, ...OV_TYPES].map(([k, , i]) => [k, i]));
const ANIMS = ['none', 'fade', 'slide', 'zoom', 'bounce', 'spin', 'float'];
const ACCENTS = ['#6d5efc', '#18c6d6', '#ff5fa2', '#e63946', '#f5a524', '#22c08a', '#0a66c2', '#d4af6a', '#111827'];
const BGS = [
  'radial-gradient(1200px 700px at 50% 30%, #2b2f4a, #0d0f1a)', 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)', 'linear-gradient(135deg, #1d1b3a, #6d5efc)',
  'linear-gradient(160deg, #3b1d1d, #7a2a2a, #b0623a)', 'linear-gradient(135deg, #e0eafc, #cfdef3)', 'linear-gradient(135deg, #fdfbfb, #ebedee)',
  'linear-gradient(135deg, #134e5e, #71b280)', 'radial-gradient(circle at 30% 20%, #3a2f12, #0f1117 60%)',
];

function defaults(type, book) {
  switch (type) {
    case 'link': return { url: 'https://', newTab: true };
    case 'page': return { page: Math.min(book.pages.length - 1, 1) };
    case 'video': return { url: '', mode: 'popup' };
    case 'audio': return { url: '' };
    case 'image': return { src: '', caption: '' };
    case 'gallery': return { images: [] };
    case 'note': return { title: 'Did you know?', text: 'Add your note here.' };
    case 'quiz': return { question: 'Your question?', options: ['Answer A', 'Answer B', 'Answer C'], correct: 0 };
    case 'embed': return { url: 'https://www.openstreetmap.org/export/embed.html?bbox=-0.15,51.49,-0.09,51.52' };
    case 'product': return { name: 'Product name', price: '$49', desc: '', image: '', url: '', sku: '' };
    case 'text': return { text: 'Your text' };
    case 'sticker': return { src: '' };
    default: return {};
  }
}
function styleDefaults(type) {
  if (type === 'text') return { color: '#111111', size: 28, weight: 700, align: 'left', bg: 'transparent', anim: 'fade' };
  if (type === 'shape') return { fill: '#6d5efc', opacity: 0.35, shape: 'rect', radius: 12, anim: 'none' };
  if (type === 'sticker') return { anim: 'zoom' };
  return { pulse: true, icon: true, anim: 'none' };
}

export async function openEditor(app, id) {
  const book = await db.getBook(id);
  if (!book) { location.hash = '#/'; return; }
  book.settings = { ...defaultSettings(book.type), ...book.settings, tools: { ...defaultSettings(book.type).tools, ...book.settings.tools } };
  book.hotspots = book.hotspots || [];
  const st = { page: 0, sel: null, tool: null, tab: 'interact', hideAuto: false };
  const undo = [], redo = [];
  let dirty = false;

  app.innerHTML = `
  <div class="editor">
    <div class="ed-top">
      <a class="btn ghost icon" href="#/" title="Back to library" aria-label="Back to library">${icon('prev')}</a>
      <input class="ed-title" value="${esc(book.title)}" aria-label="Title">
      <span class="ed-save" data-save>Saved</span>
      <div class="row" style="margin-left:auto">
        <button class="btn ghost icon" data-undo title="Undo (Ctrl+Z)" aria-label="Undo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg></button>
        <button class="btn ghost icon" data-redo title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/></svg></button>
        <button class="btn" data-preview>${icon('eye', 16)} Preview</button>
        <button class="btn primary" data-publish>${icon('share', 16)} Publish</button>
      </div>
    </div>
    <div class="ed-body">
      <div class="ed-pages" data-strip aria-label="Pages"></div>
      <div class="ed-stage">
        <div class="ed-tools" data-tools></div>
        <div class="canvas-wrap" data-wrap><div class="canvas" data-canvas><div class="fv-pg" data-pg style="position:absolute;inset:0;background-size:100% 100%"></div><div data-boxes style="position:absolute;inset:0"></div></div></div>
      </div>
      <div class="ed-side">
        <div class="ed-tabs" data-tabs role="tablist"></div>
        <div class="ed-panel" data-panel></div>
      </div>
    </div>
  </div>`;
  const $ = (s) => app.querySelector(s);
  const canvas = $('[data-canvas]'), boxes = $('[data-boxes]');

  /* ---------- persistence & history ---------- */
  const snapshot = () => JSON.stringify({ pages: book.pages, hotspots: book.hotspots, settings: book.settings, title: book.title, source: book.source, aspect: book.aspect });
  let last = snapshot();
  const saveNow = async () => { await db.saveBook(book); dirty = false; $('[data-save]').textContent = 'Saved'; };
  const saveSoon = debounce(saveNow, 500);
  function change({ strip = false, canvasToo = true, panel = false } = {}) {
    const s = snapshot();
    if (s !== last) { undo.push(last); if (undo.length > 40) undo.shift(); redo.length = 0; last = s; }
    dirty = true; $('[data-save]').textContent = 'Saving…'; saveSoon();
    if (strip) renderStrip(); else updateStripBadges();
    if (canvasToo) renderBoxes();
    if (panel) renderPanel();
  }
  function restore(s) {
    const o = JSON.parse(s);
    Object.assign(book, o);
    last = s; st.sel = null; st.page = Math.min(st.page, book.pages.length - 1);
    renderAll(); dirty = true; saveSoon();
  }
  $('[data-undo]').onclick = () => { if (undo.length) { redo.push(last); restore(undo.pop()); } };
  $('[data-redo]').onclick = () => { if (redo.length) { undo.push(last); restore(redo.pop()); } };
  $('.ed-title').onchange = (e) => { book.title = e.target.value.trim() || 'Untitled'; change({ canvasToo: false }); };

  /* ---------- page strip ---------- */
  function renderStrip() {
    const strip = $('[data-strip]');
    strip.innerHTML = book.pages.map((p, i) => `<div class="ed-pg ${i === st.page ? 'on' : ''}" draggable="true" data-i="${i}" tabindex="0" role="button" aria-label="Page ${i + 1}"><div class="pv" style="--a:${book.aspect}"></div><div class="pn"><span>${i + 1}${i === (book.settings.startPage | 0) && i ? ' ★' : ''}</span><span class="hsn" data-hsn ${countHs(i) ? '' : 'hidden'}>${countHs(i)}</span></div></div>`).join('')
      + `<button class="btn sm" data-addpage style="flex:none">${icon('plus', 14)} Add</button>`;
    strip.querySelectorAll('.ed-pg').forEach(el => {
      const i = +el.dataset.i;
      pagePreview(el.querySelector('.pv'), book.pages[i]);
      el.onclick = () => selectPage(i);
      el.onkeydown = (e) => { if (e.key === 'Enter') selectPage(i); };
      el.ondragstart = (e) => { e.dataTransfer.setData('text/ff-page', String(i)); e.dataTransfer.effectAllowed = 'move'; };
      el.ondragover = (e) => { if (e.dataTransfer.types.includes('text/ff-page')) { e.preventDefault(); el.classList.add('drag-over'); } };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = (e) => { e.preventDefault(); el.classList.remove('drag-over'); const from = +e.dataTransfer.getData('text/ff-page'); if (!isNaN(from) && from !== i) movePage(from, i); };
    });
    strip.querySelector('[data-addpage]').onclick = () => { st.tab = 'pages'; renderTabs(); renderPanel(); };
  }
  const countHs = (i) => book.hotspots.filter(h => h.page === i).length;
  function updateStripBadges() { app.querySelectorAll('.ed-pg').forEach(el => { const n = countHs(+el.dataset.i); const b = el.querySelector('[data-hsn]'); b.textContent = n; b.hidden = !n; }); }
  function selectPage(i) {
    st.page = Math.max(0, Math.min(book.pages.length - 1, i)); st.sel = null;
    app.querySelectorAll('.ed-pg').forEach(el => el.classList.toggle('on', +el.dataset.i === st.page));
    app.querySelector(`.ed-pg[data-i="${st.page}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    renderCanvas(); renderPanel();
  }
  function movePage(from, to) {
    const [p] = book.pages.splice(from, 1); book.pages.splice(to, 0, p);
    const map = (k) => k === from ? to : (from < to ? (k > from && k <= to ? k - 1 : k) : (k >= to && k < from ? k + 1 : k));
    book.hotspots.forEach(h => { h.page = map(h.page); if (h.type === 'page') h.data.page = map(h.data.page | 0); });
    (book.settings.toc || []).forEach(t => t.page = map(t.page));
    st.page = to; change({ strip: true }); renderCanvas();
  }

  /* ---------- canvas ---------- */
  function fitCanvas() {
    const wrap = $('[data-wrap]'); if (!wrap) return; const r = wrap.getBoundingClientRect();
    const W = r.width - 48, H = r.height - 48;
    let h = H, w = h * book.aspect; if (w > W) { w = W; h = w / book.aspect; }
    canvas.style.width = Math.max(120, w) + 'px'; canvas.style.height = Math.max(120 / book.aspect, h) + 'px';
    canvas.style.setProperty('--ff-scale', String(w / 800));
    const pg = canvas.querySelector('.ff-html'); if (pg) pg.style.transform = `scale(${w / 800})`;
  }
  async function renderCanvas() {
    const p = book.pages[st.page];
    const pg = $('[data-pg]');
    fitCanvas();
    await pagePreview(pg, p, { full: true });
    fitCanvas();
    renderBoxes();
  }
  new ResizeObserver(() => { fitCanvas(); }).observe($('[data-wrap]'));

  function renderBoxes() {
    const list = book.hotspots.filter(h => h.page === st.page && !(st.hideAuto && h.auto));
    boxes.innerHTML = list.map(h => {
      const ov = ['text', 'shape', 'sticker'].includes(h.type);
      return `<div class="hs-box ${h.auto ? 'auto' : ''} ${ov ? 'ov' : ''} ${h.id === st.sel ? 'sel' : ''}" data-id="${h.id}" style="left:${h.x * 100}%;top:${h.y * 100}%;width:${h.w * 100}%;height:${h.h * 100}%"><div class="ovc"></div><span class="lbl">${icon(TYPE_ICON[h.type] || 'link', 11)} ${esc(TYPE_NAME[h.type] || h.type)}${h.auto ? ' (auto)' : ''}</span><span class="h"></span></div>`;
    }).join('');
    // live overlay previews
    boxes.querySelectorAll('.hs-box.ov').forEach(async b => {
      const h = book.hotspots.find(x => x.id === b.dataset.id), s = h.style || {}, c = b.querySelector('.ovc');
      if (h.type === 'text') c.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 .3em;color:${s.color};background:${s.bg};font-weight:${s.weight};justify-content:${s.align === 'center' ? 'center' : s.align === 'right' ? 'flex-end' : 'flex-start'};font-family:${s.font || 'inherit'};font-size:calc(${s.size || 24}px * var(--ff-scale));line-height:1.15;border-radius:${s.radius ?? 6}px">${esc(h.data.text)}</div>`;
      if (h.type === 'shape') c.innerHTML = `<div style="width:100%;height:100%;background:${s.fill};opacity:${s.opacity};border-radius:${s.shape === 'ellipse' ? '50%' : (s.radius ?? 8) + 'px'};${s.border ? `border:3px solid ${s.border}` : ''}"></div>`;
      if (h.type === 'sticker') { const u = await blobUrl(h.data.blob || h.data.src); c.innerHTML = u ? `<img src="${u}" style="width:100%;height:100%;object-fit:contain" alt="">` : ''; }
    });
  }

  // drawing, moving, resizing
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height;
    const box = e.target.closest('.hs-box');
    if (st.tool) {
      drag = { mode: 'draw', x0: px, y0: py, el: document.createElement('div') };
      drag.el.className = 'draft'; canvas.appendChild(drag.el);
    } else if (box) {
      const h = book.hotspots.find(x => x.id === box.dataset.id);
      select(h.id);
      drag = { mode: e.target.classList.contains('h') ? 'resize' : 'move', h, x0: px, y0: py, orig: { ...h }, moved: false };
    } else { select(null); return; }
    canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    if (drag.mode === 'draw') {
      const x = Math.min(px, drag.x0), y = Math.min(py, drag.y0), w = Math.abs(px - drag.x0), h = Math.abs(py - drag.y0);
      Object.assign(drag.el.style, { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%' });
      drag.rect = { x, y, w, h };
    } else {
      const { h, orig } = drag; drag.moved = true;
      if (drag.mode === 'move') { h.x = Math.max(0, Math.min(1 - orig.w, orig.x + px - drag.x0)); h.y = Math.max(0, Math.min(1 - orig.h, orig.y + py - drag.y0)); }
      else { h.w = Math.max(0.02, Math.min(1 - orig.x, orig.w + px - drag.x0)); h.h = Math.max(0.015, Math.min(1 - orig.y, orig.h + py - drag.y0)); }
      const el = boxes.querySelector(`[data-id="${h.id}"]`);
      Object.assign(el.style, { left: h.x * 100 + '%', top: h.y * 100 + '%', width: h.w * 100 + '%', height: h.h * 100 + '%' });
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mode === 'draw') {
      d.el.remove();
      let r = d.rect;
      if (!r || r.w < 0.015 || r.h < 0.01) { const w = st.tool === 'text' ? 0.5 : 0.24, h = st.tool === 'text' ? 0.07 : 0.12; r = { x: Math.min(1 - w, d.x0), y: Math.min(1 - h, d.y0), w, h }; }
      addHotspot(st.tool, r);
      if (!e.shiftKey) setTool(null);
    } else if (d.moved) change({ canvasToo: false, panel: true });
  });

  function addHotspot(type, r) {
    const h = { id: uid('hs_'), page: st.page, ...r, type, data: defaults(type, book), style: styleDefaults(type) };
    book.hotspots.push(h); st.sel = h.id; st.tab = 'interact';
    change({ panel: true }); renderTabs();
  }
  function select(id) { st.sel = id; boxes.querySelectorAll('.hs-box').forEach(b => b.classList.toggle('sel', b.dataset.id === id)); if (st.tab !== 'interact') { st.tab = 'interact'; renderTabs(); } renderPanel(); }
  function setTool(t) {
    st.tool = t; canvas.classList.toggle('drawing', !!t);
    app.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === (t || 'select')));
    let hint = app.querySelector('.ed-hint');
    if (t) { if (!hint) { hint = document.createElement('div'); hint.className = 'ed-hint'; $('.ed-stage').appendChild(hint); } hint.textContent = `Drag on the page to place: ${TYPE_NAME[t]} (hold Shift to place several)`; }
    else hint?.remove();
  }

  function renderTools() {
    $('[data-tools]').innerHTML = `<button class="tool on" data-tool="select">${icon('settings', 15)} Select</button><span class="sep"></span>`
      + HS_TYPES.map(([k, n, i]) => `<button class="tool" data-tool="${k}" title="${n}">${icon(i, 15)} <span>${n.split(' ')[0]}</span></button>`).join('')
      + `<span class="sep"></span>` + OV_TYPES.map(([k, n, i]) => `<button class="tool" data-tool="${k}" title="Overlay: ${n}">${icon(i, 15)} <span>${n.split(' ')[0]}</span></button>`).join('')
      + `<span class="sep"></span><button class="tool" data-hideauto title="Show/hide auto-detected PDF links">${icon('eye', 15)} Auto links</button>`;
    app.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool === 'select' ? null : b.dataset.tool));
    $('[data-hideauto]').onclick = (e) => { st.hideAuto = !st.hideAuto; e.currentTarget.classList.toggle('on', st.hideAuto); renderBoxes(); };
  }

  /* ---------- side panel ---------- */
  const TABS = () => [['interact', 'Interactivity'], ['design', 'Design'], ...(book.source ? [['content', 'Content']] : []), ['pages', 'Pages'], ['settings', 'Settings'], ['publish', 'Publish']];
  function renderTabs() {
    $('[data-tabs]').innerHTML = TABS().map(([k, l]) => `<button role="tab" aria-selected="${k === st.tab}" class="${k === st.tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; renderTabs(); renderPanel(); });
  }
  function renderPanel() {
    const P = $('[data-panel]');
    ({ interact: panelInteract, design: panelDesign, content: panelContent, pages: panelPages, settings: panelSettings, publish: panelPublish })[st.tab](P);
  }

  // binds inputs having data-k="path.to.value" against an object
  function bind(P, root, onChange) {
    P.querySelectorAll('[data-k]').forEach(inp => {
      const path = inp.dataset.k.split('.');
      const get = () => path.reduce((o, k) => o?.[k], root);
      const set = (v) => { let o = root; for (const k of path.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } o[path.at(-1)] = v; };
      const v = get();
      if (inp.type === 'checkbox') inp.checked = !!v; else if (v != null && inp.type !== 'file') inp.value = v;
      inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' || inp.type === 'color' || inp.type === 'range' ? 'input' : 'change', () => {
        let val = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (inp.type === 'number' || inp.type === 'range' || inp.dataset.num != null) val = parseFloat(val) || 0;
        set(val); onChange && onChange(inp);
      });
    });
    P.querySelectorAll('[data-seg]').forEach(seg => {
      const path = seg.dataset.seg.split('.');
      const get = () => path.reduce((o, k) => o?.[k], root);
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', String(get()) === b.dataset.v);
        b.onclick = () => { let o = root; for (const k of path.slice(0, -1)) o = o[k] = o[k] || {}; o[path.at(-1)] = b.dataset.v; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onChange && onChange(seg); };
      });
    });
  }

  async function uploadInto(accept, cb) {
    const [f] = await pickFiles({ accept }); if (!f) return;
    if (f.size > 60 * 1048576) return toast('File is larger than 60 MB', true);
    cb(await db.putBlob(f), f);
  }

  function panelInteract(P) {
    const h = book.hotspots.find(x => x.id === st.sel);
    const onPage = book.hotspots.filter(x => x.page === st.page);
    if (!h) {
      P.innerHTML = `<h4>Add to page ${st.page + 1}</h4><p class="muted" style="font-size:13px;margin-top:0">Choose an element, then drag a box on the page.</p>
        <div class="typebtns">${[...HS_TYPES, ...OV_TYPES].map(([k, n, i]) => `<button data-add="${k}">${icon(i, 18)}${n}</button>`).join('')}</div>
        <h4>On this page (${onPage.length})</h4><div class="hs-list">${onPage.map(x => `<div class="hs-item" data-sel="${x.id}">${icon(TYPE_ICON[x.type], 15)}<span>${esc(TYPE_NAME[x.type])}: ${esc(x.data.url || x.data.title || x.data.text || x.data.name || x.data.question || (x.type === 'page' ? 'page ' + ((x.data.page | 0) + 1) : ''))}</span>${x.auto ? '<span class="pill">auto</span>' : ''}</div>`).join('') || '<p class="faint" style="font-size:13px">Nothing yet.</p>'}</div>
        <h4>Whole publication</h4><p class="muted" style="font-size:13px">${book.hotspots.length} interactive elements across ${new Set(book.hotspots.map(x => x.page)).size} pages.</p>
        ${book.hotspots.some(x => x.auto) ? `<button class="btn sm danger" data-rmauto>Remove auto-detected links</button>` : ''}`;
      P.querySelectorAll('[data-add]').forEach(b => b.onclick = () => setTool(b.dataset.add));
      P.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => select(b.dataset.sel));
      P.querySelector('[data-rmauto]')?.addEventListener('click', () => { book.hotspots = book.hotspots.filter(x => !x.auto); change({ panel: true }); });
      return;
    }
    const d = h.data, s = h.style = h.style || {};
    const pageOpts = book.pages.map((_, i) => `<option value="${i}">Page ${i + 1}</option>`).join('');
    const fields = {
      link: `<label class="field"><span>URL (web, mailto:, tel:)</span><input data-k="data.url" placeholder="https://"></label><label class="check"><input type="checkbox" data-k="data.newTab"> Open in new tab</label><label class="field"><span>Accessible label</span><input data-k="data.label" placeholder="e.g. Visit our store"></label>`,
      page: `<label class="field"><span>Jump to</span><select data-k="data.page" data-num>${pageOpts}</select></label>`,
      video: `<label class="field"><span>YouTube / Vimeo / MP4 URL</span><input data-k="data.url" placeholder="https://youtube.com/watch?v=…"></label><div class="row" style="margin:-6px 0 12px"><button class="btn sm" data-up="video">${icon('upload', 14)} ${d.blob ? 'Replace' : 'Upload'} video file</button>${d.blob ? '<span class="pill accent">file attached</span>' : ''}</div><div class="field"><span>Display</span><div class="seg" data-seg="data.mode"><button data-v="popup">Pop-up player</button><button data-v="inline">Inside page</button></div></div><label class="check"><input type="checkbox" data-k="data.autoplay"> Autoplay muted loop (uploaded inline video)</label>`,
      audio: `<label class="field"><span>Audio URL (MP3 / OGG)</span><input data-k="data.url" placeholder="https://…/sound.mp3"></label><button class="btn sm" data-up="audio">${icon('upload', 14)} ${d.blob ? 'Replace' : 'Upload'} audio</button>`,
      image: `<label class="field"><span>Image URL</span><input data-k="data.src" placeholder="https://…"></label><button class="btn sm" data-up="image">${icon('upload', 14)} ${d.blob ? 'Replace' : 'Upload'} image</button><label class="field" style="margin-top:12px"><span>Caption</span><input data-k="data.caption"></label>`,
      gallery: `<div class="field"><span>Images (${(d.images || []).length})</span><div class="thumbs-strip" data-gal></div></div><button class="btn sm" data-gadd>${icon('upload', 14)} Add images</button>`,
      note: `<label class="field"><span>Title</span><input data-k="data.title"></label><label class="field"><span>Text</span><textarea rows="5" data-k="data.text"></textarea></label>`,
      quiz: `<label class="field"><span>Question</span><input data-k="data.question"></label><label class="field"><span>Answers (one per line)</span><textarea rows="4" data-opts>${esc((d.options || []).join('\n'))}</textarea></label><label class="field"><span>Correct answer</span><select data-k="data.correct" data-num>${(d.options || []).map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('')}</select></label>`,
      embed: `<label class="field"><span>Embed URL</span><input data-k="data.url" placeholder="Google Maps, Forms, Calendly, Typeform, Figma…"><small>Paste the <b>src</b> of an embed code. Shown in a pop-up frame.</small></label>`,
      product: `<label class="field"><span>Name</span><input data-k="data.name"></label><div class="grid2"><label class="field"><span>Price</span><input data-k="data.price"></label><label class="field"><span>SKU</span><input data-k="data.sku"></label></div><label class="field"><span>Description</span><textarea rows="3" data-k="data.desc"></textarea></label><label class="field"><span>Product page URL</span><input data-k="data.url"></label><label class="field"><span>Image URL</span><input data-k="data.image"></label><button class="btn sm" data-up="image">${icon('upload', 14)} Upload image</button><p class="faint" style="font-size:12px">Orders are sent via the email / WhatsApp set in Settings → Shop.</p>`,
      text: `<label class="field"><span>Text</span><textarea rows="3" data-k="data.text"></textarea></label><div class="grid2"><label class="field"><span>Size</span><input type="number" data-k="style.size" min="8" max="200"></label><label class="field"><span>Weight</span><select data-k="style.weight"><option value="400">Regular</option><option value="600">Semibold</option><option value="800">Heavy</option></select></label></div><div class="grid2"><label class="field"><span>Color</span><input type="color" data-k="style.color"></label><label class="field"><span>Background</span><select data-k="style.bg"><option value="transparent">None</option><option value="rgba(255,255,255,.9)">White</option><option value="rgba(0,0,0,.7)">Dark</option><option value="#ffe066">Highlight</option><option value="${book.settings.accent}">Accent</option></select></label></div><div class="field"><span>Align</span><div class="seg" data-seg="style.align"><button data-v="left">Left</button><button data-v="center">Center</button><button data-v="right">Right</button></div></div><label class="field"><span>Font</span><select data-k="style.font"><option value="">Default</option><option value="'Space Grotesk',sans-serif">Space Grotesk</option><option value="'Playfair Display',serif">Playfair</option><option value="'Bebas Neue',sans-serif">Bebas Neue</option><option value="'Baloo 2',sans-serif">Baloo</option><option value="Georgia,serif">Georgia</option></select></label>`,
      shape: `<div class="field"><span>Shape</span><div class="seg" data-seg="style.shape"><button data-v="rect">Rectangle</button><button data-v="ellipse">Ellipse</button></div></div><div class="grid2"><label class="field"><span>Fill</span><input type="color" data-k="style.fill"></label><label class="field"><span>Border</span><input type="color" data-k="style.border"></label></div><label class="field"><span>Opacity</span><input type="range" min="0" max="1" step="0.05" data-k="style.opacity"></label><label class="field"><span>Corner radius</span><input type="range" min="0" max="60" data-k="style.radius"></label><p class="faint" style="font-size:12px">Tip: a white shape can hide parts of a PDF page (e.g. an old price), then add a Text overlay on top.</p>`,
      sticker: `<label class="field"><span>Image / GIF URL</span><input data-k="data.src"></label><button class="btn sm" data-up="sticker">${icon('upload', 14)} ${d.blob ? 'Replace' : 'Upload'} image or GIF</button>`,
    }[h.type] || '';
    const isOv = ['text', 'shape', 'sticker'].includes(h.type);
    P.innerHTML = `<div class="row" style="justify-content:space-between"><h4 style="margin:0">${icon(TYPE_ICON[h.type], 15)} ${esc(TYPE_NAME[h.type])}</h4><button class="btn sm ghost" data-back>← All</button></div>
      <div style="margin-top:14px">${fields}</div>
      <h4>Appearance</h4>
      ${isOv ? '' : `<label class="check"><input type="checkbox" data-k="style.pulse"> Pulse to attract attention</label><label class="check"><input type="checkbox" data-k="style.icon"> Show icon badge</label>`}
      ${h.type !== 'video' || d.mode !== 'inline' ? `<label class="field"><span>Entrance animation</span><select data-k="style.anim">${ANIMS.map(a => `<option value="${a}">${a}</option>`).join('')}</select></label>` : ''}
      <h4>Position</h4><div class="grid2">${['x', 'y', 'w', 'h'].map(k => `<label class="field"><span>${{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[k]} %</span><input type="number" step="0.5" data-pos="${k}" value="${(h[k] * 100).toFixed(1)}"></label>`).join('')}</div>
      <div class="row wrap"><button class="btn sm" data-dup>${icon('copy', 14)} Duplicate</button><button class="btn sm" data-allpages title="Copy to every page (e.g. logo, back-to-contents button)">${icon('page', 14)} Copy to all pages</button><button class="btn sm danger" data-del>${icon('trash', 14)} Delete</button></div>`;
    bind(P, h, (inp) => { delete h.auto; change({ canvasToo: true }); if (inp?.dataset?.seg) panelInteract(P); });
    P.querySelector('[data-back]').onclick = () => select(null);
    P.querySelectorAll('[data-pos]').forEach(inp => inp.onchange = () => { h[inp.dataset.pos] = Math.max(0, Math.min(1, (parseFloat(inp.value) || 0) / 100)); change(); });
    P.querySelector('[data-del]').onclick = () => { book.hotspots = book.hotspots.filter(x => x.id !== h.id); st.sel = null; change({ panel: true }); };
    P.querySelector('[data-dup]').onclick = () => { const c = structuredClone(h); c.id = uid('hs_'); c.x = Math.min(1 - c.w, c.x + 0.03); c.y = Math.min(1 - c.h, c.y + 0.03); book.hotspots.push(c); st.sel = c.id; change({ panel: true }); };
    P.querySelector('[data-allpages]').onclick = () => { for (let i = 0; i < book.pages.length; i++) if (i !== h.page) { const c = structuredClone(h); c.id = uid('hs_'); c.page = i; book.hotspots.push(c); } change({ strip: true }); toast(`Copied to ${book.pages.length - 1} pages`); };
    P.querySelectorAll('[data-up]').forEach(b => b.onclick = () => uploadInto({ video: 'video/*', audio: 'audio/*', image: 'image/*', sticker: 'image/*' }[b.dataset.up], (key) => { d.blob = key; change({ panel: true }); }));
    const opts = P.querySelector('[data-opts]');
    if (opts) opts.onchange = () => { d.options = opts.value.split('\n').map(x => x.trim()).filter(Boolean); d.correct = Math.min(d.correct | 0, d.options.length - 1); change({ panel: true }); };
    const gal = P.querySelector('[data-gal]');
    if (gal) {
      (d.images || []).forEach(async (k, i) => { const im = new Image(); im.src = await blobUrl(k); im.title = 'Click to remove'; im.style.cursor = 'pointer'; im.onclick = () => { d.images.splice(i, 1); change({ panel: true }); }; gal.appendChild(im); });
      P.querySelector('[data-gadd]').onclick = async () => { const fs = await pickFiles({ accept: 'image/*', multiple: true }); d.images = d.images || []; for (const f of fs) d.images.push(await db.putBlob(f)); change({ panel: true }); };
    }
  }

  function panelDesign(P) {
    const S = book.settings;
    P.innerHTML = `
      <h4>Reader skin</h4><div class="seg" data-seg="skin"><button data-v="dark">Dark</button><button data-v="light">Light</button><button data-v="glass">Glass</button></div>
      <h4>Accent colour</h4><div class="row wrap"><div class="swatches">${ACCENTS.map(c => `<button class="sw ${S.accent === c ? 'on' : ''}" style="background:${c}" data-acc="${c}" aria-label="${c}"></button>`).join('')}</div><input type="color" data-k="accent" aria-label="Custom accent"></div>
      <h4>Background</h4><div class="bgs">${BGS.map((g, i) => `<button style="background:${g}" data-bg="${i}" class="${S.background?.value === g ? 'on' : ''}" aria-label="Background ${i + 1}"></button>`).join('')}</div>
      <div class="row wrap" style="margin-top:10px"><input type="color" data-solid aria-label="Solid colour"><button class="btn sm" data-bgimg>${icon('image', 14)} Image</button>${S.bgBlob ? '<button class="btn sm ghost" data-bgclear>Remove image</button>' : ''}<label class="check"><input type="checkbox" data-k="background.blur"> Blur</label></div>
      <h4>Branding</h4><div class="row wrap"><button class="btn sm" data-logo>${icon('upload', 14)} ${S.logoBlob ? 'Replace logo' : 'Upload logo'}</button>${S.logoBlob ? '<button class="btn sm ghost" data-logoclear>Remove</button>' : ''}</div>
      <label class="field" style="margin-top:10px"><span>Logo link</span><input data-k="logoLink" placeholder="https://yourbrand.com"></label>
      <label class="check"><input type="checkbox" data-k="cta.enabled"> Call-to-action button in toolbar</label>
      <div class="grid2"><label class="field"><span>Button label</span><input data-k="cta.label"></label><label class="field"><span>Button URL</span><input data-k="cta.url" placeholder="https://"></label></div>
      <label class="check"><input type="checkbox" data-k="backlink"> Show “Made with FlipForge”</label>
      <h4>Page turning</h4>
      <div class="field"><span>Effect</span><div class="seg" data-seg="effect"><button data-v="flip">3D flip</button><button data-v="slide">Slide</button><button data-v="fade">Fade</button></div></div>
      <div class="field"><span>Layout</span><div class="seg" data-seg="layout"><button data-v="auto">Auto</button><button data-v="double">Spread</button><button data-v="single">Single page</button></div></div>
      <label class="check"><input type="checkbox" data-k="hardcover"> Hardcover look</label>
      <label class="check"><input type="checkbox" data-k="rtl"> Right-to-left (Arabic, Hebrew, manga)</label>
      <label class="check"><input type="checkbox" data-k="flipSound"> Page-flip sound</label>
      <label class="check"><input type="checkbox" data-k="highlightLinks"> Highlight interactive areas</label>
      <label class="field"><span>Slideshow speed (seconds)</span><input type="number" min="2" max="60" data-k="autoplaySeconds"></label>
      <h4>Background music</h4>
      <div class="row wrap"><button class="btn sm" data-music>${icon('music', 14)} ${S.music?.blob ? 'Replace track' : 'Upload track'}</button>${S.music?.blob ? '<span class="pill accent">track attached</span><button class="btn sm ghost" data-musicclear>Remove</button>' : ''}</div>
      <label class="field" style="margin-top:10px"><span>…or music URL</span><input data-k="music.src" placeholder="https://…/music.mp3"></label>
      <label class="check"><input type="checkbox" data-k="music.autoplay"> Start on first tap</label>
      <label class="field"><span>Volume</span><input type="range" min="0" max="1" step="0.05" data-k="music.volume"></label>
      <h4>Toolbar</h4>
      ${[['thumbnails', 'Thumbnails'], ['toc', 'Table of contents'], ['search', 'Search'], ['zoom', 'Zoom'], ['fullscreen', 'Full screen'], ['share', 'Share & embed'], ['download', 'Download PDF'], ['print', 'Print'], ['sound', 'Sound toggle'], ['autoplay', 'Slideshow'], ['tts', 'Read aloud'], ['bookmarks', 'Bookmarks'], ['notes', 'Reader notes'], ['night', 'Night reading']].map(([k, l]) => `<label class="check"><input type="checkbox" data-k="tools.${k}"> ${l}</label>`).join('')}`;
    bind(P, S, () => change({ canvasToo: false }));
    P.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { S.accent = b.dataset.acc; change({ canvasToo: false }); panelDesign(P); });
    P.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { S.background = { ...S.background, kind: 'gradient', value: BGS[+b.dataset.bg] }; change({ canvasToo: false }); panelDesign(P); });
    P.querySelector('[data-solid]').oninput = (e) => { S.background = { ...S.background, kind: 'color', value: e.target.value }; change({ canvasToo: false }); };
    P.querySelector('[data-bgimg]').onclick = () => uploadInto('image/*', (k) => { S.bgBlob = k; S.background = { ...S.background, kind: 'image' }; change({ canvasToo: false }); panelDesign(P); });
    P.querySelector('[data-bgclear]')?.addEventListener('click', () => { S.bgBlob = null; S.background = { kind: 'gradient', value: BGS[0] }; change({ canvasToo: false }); panelDesign(P); });
    P.querySelector('[data-logo]').onclick = () => uploadInto('image/*', (k) => { S.logoBlob = k; change({ canvasToo: false }); panelDesign(P); });
    P.querySelector('[data-logoclear]')?.addEventListener('click', () => { S.logoBlob = null; change({ canvasToo: false }); panelDesign(P); });
    P.querySelector('[data-music]').onclick = () => uploadInto('audio/*', (k) => { S.music = { ...S.music, blob: k }; change({ canvasToo: false }); panelDesign(P); });
    P.querySelector('[data-musicclear]')?.addEventListener('click', () => { S.music.blob = null; change({ canvasToo: false }); panelDesign(P); });
  }

  function panelContent(P) {
    const src = book.source;
    P.innerHTML = `
      <div class="grid2"><label class="field"><span>Theme</span><select data-theme>${THEMES.map(t => `<option value="${t.id}" ${t.id === src.theme ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
      <label class="field"><span>Page size</span><select data-size>${SIZES.map(s => `<option value="${s.id}" ${s.id === src.size ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label></div>
      <label class="field"><span>Document</span><textarea class="code" rows="18" data-md>${esc(src.markdown)}</textarea></label>
      <button class="btn primary" style="width:100%" data-rebuild>${icon('check', 16)} Rebuild pages</button>
      <p class="faint" style="font-size:12px">Rebuilding re-flows text into pages. Hotspots you drew stay on the same page numbers.</p>
      <h4>${icon('wand', 14)} AI assistant</h4>
      <label class="field"><span>Ask Claude to change the document</span><textarea rows="2" data-ai placeholder="e.g. Add a chapter on budgeting with a quiz · Translate to Spanish · Make it shorter and punchier"></textarea></label>
      <button class="btn" style="width:100%" data-aigo>${icon('spark', 16)} Apply with AI</button>
      <div class="ai-out" data-aiout hidden style="margin-top:10px;height:160px"></div>
      <h4>Block reference</h4><div class="md-help">${BLOCK_HELP.map(([a, b]) => `<div><code>${esc(a)}</code><br>${esc(b)}</div>`).join('')}</div>`;
    const rebuild = () => {
      src.markdown = P.querySelector('[data-md]').value; src.theme = P.querySelector('[data-theme]').value; src.size = P.querySelector('[data-size]').value;
      const aspect = SIZES.find(s => s.id === src.size).aspect;
      const r = compose(src.markdown, { theme: src.theme, aspect });
      book.pages = r.pages; book.aspect = aspect; book.settings.toc = r.toc;
      if (r.meta.title && book.title === 'Untitled') book.title = r.meta.title;
      book.hotspots = book.hotspots.filter(h => h.page < book.pages.length);
      st.page = Math.min(st.page, book.pages.length - 1);
      change({ strip: true }); renderCanvas(); toast(`Rebuilt: ${book.pages.length} pages`);
    };
    P.querySelector('[data-rebuild]').onclick = rebuild;
    P.querySelector('[data-aigo]').onclick = async () => {
      const ai = await import('./ai.js'); const key = await ai.getKey();
      if (!key) { toast('Add your Anthropic API key in Settings first', true); return; }
      const ins = P.querySelector('[data-ai]').value.trim(); if (!ins) return;
      const out = P.querySelector('[data-aiout]'); out.hidden = false; out.textContent = 'Thinking…';
      const btn = P.querySelector('[data-aigo]'); btn.disabled = true;
      try {
        const md = await ai.reviseDocument({ apiKey: key, markdown: P.querySelector('[data-md]').value, instruction: ins }, { onText: (t) => { out.textContent = t; out.scrollTop = out.scrollHeight; } });
        P.querySelector('[data-md]').value = md; rebuild(); out.hidden = true;
      } catch (e) { toast(ai.friendlyError(e), true); }
      btn.disabled = false;
    };
  }

  function panelPages(P) {
    P.innerHTML = `
      <h4>Page ${st.page + 1} of ${book.pages.length}</h4>
      <div class="row wrap">
        <button class="btn sm" data-mv="-1">${icon('prev', 14)} Move up</button><button class="btn sm" data-mv="1">Move down ${icon('next', 14)}</button>
        <button class="btn sm" data-dupp>${icon('copy', 14)} Duplicate</button><button class="btn sm" data-start>★ Start here</button>
        <button class="btn sm" data-replace>${icon('image', 14)} Replace with image</button>
        <button class="btn sm danger" data-delp ${book.pages.length < 2 ? 'disabled' : ''}>${icon('trash', 14)} Delete</button>
      </div>
      <h4>Add pages after page ${st.page + 1}</h4>
      <div class="typebtns" style="grid-template-columns:1fr 1fr">
        <button data-addpdf>${icon('upload', 18)}From PDF</button><button data-addimg>${icon('image', 18)}From images</button>
        <button data-addtext>${icon('text', 18)}Text page</button><button data-addblank>${icon('page', 18)}Blank page</button>
      </div>
      <h4>Page text (search &amp; read-aloud)</h4>
      <textarea class="input" rows="6" data-text>${esc(book.pages[st.page]?.text || '')}</textarea>`;
    P.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const t = st.page + +b.dataset.mv; if (t >= 0 && t < book.pages.length) movePage(st.page, t); });
    P.querySelector('[data-dupp]').onclick = () => {
      const src = st.page, c = { ...structuredClone(book.pages[src]), id: uid('pg_') };
      const copies = book.hotspots.filter(h => h.page === src).map(h => ({ ...structuredClone(h), id: uid('hs_'), page: src + 1 }));
      insertPages([c], src + 1, copies);
    };
    P.querySelector('[data-start]').onclick = () => { book.settings.startPage = st.page; change({ strip: true }); toast(`Reader opens at page ${st.page + 1}`); };
    P.querySelector('[data-delp]').onclick = async () => {
      if (!(await confirmDlg('Delete page?', `Page ${st.page + 1} and its interactive elements will be removed.`))) return;
      const i = st.page; book.pages.splice(i, 1);
      book.hotspots = book.hotspots.filter(h => h.page !== i).map(h => ({ ...h, page: h.page > i ? h.page - 1 : h.page }));
      st.page = Math.min(i, book.pages.length - 1); change({ strip: true }); renderCanvas(); renderPanel();
    };
    P.querySelector('[data-replace]').onclick = async () => {
      const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return;
      const { importImages } = await import('./pdf-import.js'); const r = await importImages([f]);
      book.pages[st.page] = { ...r.pages[0], fit: 'fill' }; change({ strip: true }); renderCanvas();
    };
    P.querySelector('[data-addpdf]').onclick = async () => {
      const [f] = await pickFiles({ accept: 'application/pdf' }); if (!f) return;
      toast('Converting PDF…');
      const { importPdf } = await import('./pdf-import.js');
      const r = await importPdf(f, { onProgress: (d, t) => { $('[data-save]').textContent = `Converting ${d}/${t}…`; } });
      const at = st.page + 1;
      insertPages(r.pages, at, r.hotspots.map(h => ({ ...h, page: h.page + at, data: h.type === 'page' ? { page: h.data.page + at } : h.data })));
    };
    P.querySelector('[data-addimg]').onclick = async () => { const fs = await pickFiles({ accept: 'image/*', multiple: true }); if (!fs.length) return; const { importImages } = await import('./pdf-import.js'); const r = await importImages(fs); insertPages(r.pages.map(p => ({ ...p, fit: 'cover' })), st.page + 1); };
    P.querySelector('[data-addtext]').onclick = () => {
      const { el, close } = dialog(`<h2>Add a text page</h2><label class="field"><span>Theme</span><select data-th>${THEMES.map(t => `<option value="${t.id}" ${t.id === (book.source?.theme || 'aurora') ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label><label class="field"><span>Content (same syntax as the Content tab)</span><textarea class="code" rows="10" data-md>## New section\nWrite something here.\n\n@button Contact us | https://example.com</textarea></label><div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Add pages</button></div>`, { wide: true });
      el.querySelector('[data-go]').onclick = () => { const r = compose(el.querySelector('[data-md]').value, { theme: el.querySelector('[data-th]').value, aspect: book.aspect, cover: false, toc: false, back: false }); insertPages(r.pages, st.page + 1); close(); };
    };
    P.querySelector('[data-addblank]').onclick = () => insertPages([{ id: uid('pg_'), kind: 'html', html: `<div class="fx-page fx-theme-minimal" style="--fx-h:${Math.round(800 / book.aspect)}px"></div>`, text: '' }], st.page + 1);
    P.querySelector('[data-text]').onchange = (e) => { book.pages[st.page].text = e.target.value; change({ canvasToo: false }); };
  }
  function insertPages(pages, at, extraHs = []) {
    book.hotspots.forEach(h => { if (h.page >= at) h.page += pages.length; if (h.type === 'page' && (h.data.page | 0) >= at) h.data.page += pages.length; });
    (book.settings.toc || []).forEach(t => { if (t.page >= at) t.page += pages.length; });
    book.pages.splice(at, 0, ...pages);
    book.hotspots.push(...extraHs);
    st.page = at; change({ strip: true }); renderCanvas(); renderPanel();
    toast(`Added ${pages.length} page${pages.length > 1 ? 's' : ''}`);
  }

  function panelSettings(P) {
    const S = book.settings;
    S.toc = S.toc || [];
    P.innerHTML = `
      <h4>Table of contents</h4>
      <div data-toc>${S.toc.map((t, i) => `<div class="toc-row"><input class="input" data-tt="${i}" value="${esc(t.title)}" aria-label="Title"><input class="input" type="number" min="1" max="${book.pages.length}" data-tp="${i}" value="${t.page + 1}" aria-label="Page"><button class="btn sm ghost" data-tdel="${i}" aria-label="Remove">${icon('close', 14)}</button></div>`).join('') || '<p class="faint" style="font-size:13px">No entries.</p>'}</div>
      <div class="row wrap"><button class="btn sm" data-tadd>${icon('plus', 14)} Add entry for page ${st.page + 1}</button><button class="btn sm" data-tauto>${icon('spark', 14)} Auto-detect</button></div>
      <h4>${icon('lock', 14)} Password protection</h4>
      <label class="check"><input type="checkbox" data-pwon ${S.password?.enabled ? 'checked' : ''}> Require a password to open</label>
      <div class="row"><input class="input" type="password" data-pw placeholder="${S.password?.hash ? '•••••• (set) — type to change' : 'New password'}" autocomplete="new-password"><button class="btn sm" data-pwset>Set</button></div>
      <p class="faint" style="font-size:12px">Good for casual privacy. Exported files contain the pages, so use server-side protection for confidential material.</p>
      <h4>${icon('users', 14)} Lead capture form</h4>
      <label class="check"><input type="checkbox" data-k="lead.enabled"> Ask for contact details</label>
      <label class="field"><span>Show before page</span><input type="number" min="1" data-leadpage value="${(S.lead.page | 0) + 1}"></label>
      <label class="field"><span>Heading</span><input data-k="lead.title"></label>
      <label class="field"><span>Message</span><input data-k="lead.text"></label>
      <div class="field"><span>Fields</span>${['name', 'email', 'phone', 'company', 'role', 'message'].map(f => `<label class="check"><input type="checkbox" data-lf="${f}" ${(S.lead.fields || []).includes(f) ? 'checked' : ''}> ${f}</label>`).join('')}</div>
      <label class="field"><span>Consent text</span><input data-k="lead.consent"></label>
      <label class="check"><input type="checkbox" data-k="lead.skippable"> Allow readers to skip</label>
      <h4>${icon('cart', 14)} Shop & orders</h4>
      <label class="field"><span>Send orders to email</span><input type="email" data-k="shop.email" placeholder="orders@yourshop.com"></label>
      <label class="field"><span>…or WhatsApp number</span><input data-k="shop.whatsapp" placeholder="+15551234567"></label>
      <h4>${icon('link', 14)} Integrations</h4>
      <label class="field"><span>Webhook URL (leads, orders, sessions)</span><input data-k="integrations.webhook" placeholder="https://hooks.zapier.com/…"><small>JSON is POSTed from the reader — connect Zapier, Make, n8n, HubSpot, Google Sheets or your CRM.</small></label>
      <label class="field"><span>Google Analytics 4 ID</span><input data-k="integrations.ga4" placeholder="G-XXXXXXX"></label>
      <h4>SEO</h4>
      <label class="field"><span>Description</span><textarea rows="2" data-k="seo.description"></textarea></label>
      <label class="check"><input type="checkbox" data-k="seo.indexable"> Include page text for search engines in exports</label>`;
    bind(P, S, () => change({ canvasToo: false }));
    P.querySelectorAll('[data-tt]').forEach(i => i.onchange = () => { S.toc[+i.dataset.tt].title = i.value; change({ canvasToo: false }); });
    P.querySelectorAll('[data-tp]').forEach(i => i.onchange = () => { S.toc[+i.dataset.tp].page = Math.max(0, Math.min(book.pages.length - 1, (parseInt(i.value) || 1) - 1)); change({ canvasToo: false }); });
    P.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => { S.toc.splice(+b.dataset.tdel, 1); change({ canvasToo: false, panel: true }); });
    P.querySelector('[data-tadd]').onclick = () => { S.toc.push({ title: (book.pages[st.page].text || 'Section').split('\n')[0].slice(0, 60), page: st.page }); S.toc.sort((a, b) => a.page - b.page); change({ canvasToo: false, panel: true }); };
    P.querySelector('[data-tauto]').onclick = () => {
      if (book.source) { S.toc = compose(book.source.markdown, { theme: book.source.theme, aspect: book.aspect }).toc; }
      else S.toc = book.pages.map((p, i) => ({ title: (p.text || '').split('\n').map(x => x.trim()).find(x => x.length > 3 && x.length < 80), page: i })).filter(t => t.title).filter((_, i, a) => a.length < 25 || i % Math.ceil(a.length / 20) === 0);
      change({ canvasToo: false, panel: true }); toast(`${S.toc.length} entries`);
    };
    P.querySelector('[data-pwon]').onchange = (e) => { S.password = { ...S.password, enabled: e.target.checked }; if (e.target.checked && !S.password.hash) toast('Now set a password', true); change({ canvasToo: false }); };
    P.querySelector('[data-pwset]').onclick = async () => { const v = P.querySelector('[data-pw]').value; if (!v) return; S.password = { enabled: true, hash: await sha256(book.id + ':' + v) }; change({ canvasToo: false, panel: true }); toast('Password set'); };
    P.querySelector('[data-leadpage]').onchange = (e) => { S.lead.page = Math.max(0, (parseInt(e.target.value) || 1) - 1); change({ canvasToo: false }); };
    P.querySelectorAll('[data-lf]').forEach(c => c.onchange = () => { S.lead.fields = [...P.querySelectorAll('[data-lf]:checked')].map(x => x.dataset.lf); change({ canvasToo: false }); });
  }

  function panelPublish(P) {
    const live = new URL('viewer.html?id=' + book.id, location.href).href;
    P.innerHTML = `
      <h4>Preview</h4>
      <div class="row wrap"><button class="btn primary" data-prev>${icon('eye', 16)} Preview in studio</button><a class="btn" href="${live}" target="_blank">${icon('book', 16)} Open reader</a></div>
      <h4>Publish to the web</h4>
      <p class="muted" style="font-size:13px;margin-top:0">Export a single self-contained HTML file (pages, media, reader and analytics included) and upload it to any static host — your website, Netlify Drop, GitHub Pages, S3, WordPress media…</p>
      <button class="btn primary" style="width:100%" data-html>${icon('download', 16)} Export website (.html)</button>
      <label class="check" style="margin-top:6px"><input type="checkbox" data-pdf ${book.settings.tools.download ? 'checked' : ''} ${book.sourcePdf ? '' : 'disabled'}> Include original PDF for download</label>
      <div class="field" style="margin-top:12px"><span>Embed on your site (after uploading as <code>${slug(book.title)}.html</code>)</span><textarea class="input code" rows="3" readonly data-embed>&lt;iframe src="https://YOUR-SITE/${slug(book.title)}.html?embed=1" width="100%" height="600" style="border:0;border-radius:12px" allowfullscreen&gt;&lt;/iframe&gt;</textarea></div>
      <h4>Share on this device</h4>
      <div class="fv-qr" style="display:flex;gap:12px;align-items:center"><div style="width:110px;background:#fff;padding:6px;border-radius:10px">${qrSvg(live, 3)}</div><span class="faint" style="font-size:12px">The studio link only works in this browser. Export and host the file to share publicly.</span></div>
      <h4>Backup</h4>
      <button class="btn" style="width:100%" data-json>${icon('copy', 16)} Download project (.flipforge.json)</button>
      <h4>Print / PDF</h4>
      <p class="muted" style="font-size:13px;margin-top:0">Enable “Print” in Design → Toolbar, then use your browser's “Save as PDF”.</p>`;
    P.querySelector('[data-prev]').onclick = preview;
    P.querySelector('[data-pdf]').onchange = (e) => { book.settings.tools.download = e.target.checked; change({ canvasToo: false }); };
    P.querySelector('[data-html]').onclick = async (e) => { e.target.disabled = true; await saveNow(); toast('Packaging…'); download(slug(book.title) + '.html', await exportBookHtml(book)); e.target.disabled = false; };
    P.querySelector('[data-json]').onclick = async () => { await saveNow(); download(slug(book.title) + '.flipforge.json', await exportProject(book), 'application/json'); };
    P.querySelector('[data-embed]').onclick = (e) => e.target.select();
  }

  async function preview() {
    await saveNow();
    const f = document.createElement('div');
    f.className = 'preview-frame';
    f.innerHTML = `<div class="pf-bar"><div class="seg"><button class="on" data-dev="desktop">Desktop</button><button data-dev="tablet">Tablet</button><button data-dev="phone">Phone</button></div><label class="check" style="color:#fff;font-size:12px;padding:0 6px"><input type="checkbox" data-gates> Test gates</label><button class="btn sm" data-close>${icon('close', 14)} Close</button></div><div class="pf-body"></div>`;
    document.body.appendChild(f);
    let v = null;
    const mount = async (gates) => { v?.destroy(); v = await mountViewer(f.querySelector('.pf-body'), structuredClone(book), { mode: 'preview', assetUrl: blobUrl, startPage: st.page, skipGates: !gates, qr: (u) => qrSvg(u) }); };
    await mount(false);
    const close = () => { v?.destroy(); f.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = (e) => { if (e.key === 'Escape' && !f.querySelector('.fv-modal:not([hidden])')) close(); };
    document.addEventListener('keydown', esc_);
    f.querySelector('[data-close]').onclick = close;
    f.querySelector('[data-gates]').onchange = (e) => { if (e.target.checked) { try { localStorage.removeItem('fflead_' + book.id); localStorage.removeItem('ffpw_' + book.id); } catch { /* ignore */ } } mount(e.target.checked); };
    f.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { f.className = 'preview-frame dev-' + b.dataset.dev; f.querySelectorAll('[data-dev]').forEach(x => x.classList.toggle('on', x === b)); });
  }
  $('[data-preview]').onclick = preview;
  $('[data-publish]').onclick = () => { st.tab = 'publish'; renderTabs(); renderPanel(); };

  /* ---------- keyboard ---------- */
  const onKey = (e) => {
    if (!app.contains(document.activeElement) && document.activeElement !== document.body) return;
    if (e.target.closest('input,textarea,select,[contenteditable]')) return;
    const h = book.hotspots.find(x => x.id === st.sel);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('[data-redo]') : $('[data-undo]')).click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && h) { e.preventDefault(); P_dup(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && h) { book.hotspots = book.hotspots.filter(x => x !== h); st.sel = null; change({ panel: true }); return; }
    if (e.key === 'Escape') { setTool(null); select(null); return; }
    if (h && e.key.startsWith('Arrow')) {
      e.preventDefault(); const step = e.shiftKey ? 0.01 : 0.002;
      if (e.key === 'ArrowLeft') h.x = Math.max(0, h.x - step); if (e.key === 'ArrowRight') h.x = Math.min(1 - h.w, h.x + step);
      if (e.key === 'ArrowUp') h.y = Math.max(0, h.y - step); if (e.key === 'ArrowDown') h.y = Math.min(1 - h.h, h.y + step);
      change(); return;
    }
    if (!h && (e.key === 'ArrowDown' || e.key === 'PageDown')) { e.preventDefault(); selectPage(st.page + 1); }
    if (!h && (e.key === 'ArrowUp' || e.key === 'PageUp')) { e.preventDefault(); selectPage(st.page - 1); }
  };
  const P_dup = () => app.querySelector('[data-dup]')?.click();
  document.addEventListener('keydown', onKey);
  const onUnload = (e) => { if (dirty) { saveNow(); e.preventDefault(); } };
  window.addEventListener('beforeunload', onUnload);

  // drop PDFs/images straight onto the editor to append pages
  const onDrop = async (e) => {
    const fs = [...(e.dataTransfer?.files || [])]; if (!fs.length) return;
    e.preventDefault();
    if (fs.some(f => /\.pdf$/i.test(f.name))) { const { importPdf } = await import('./pdf-import.js'); toast('Converting PDF…'); const r = await importPdf(fs.find(f => /\.pdf$/i.test(f.name))); insertPages(r.pages, st.page + 1); }
    else if (fs.some(f => f.type.startsWith('image/'))) { const { importImages } = await import('./pdf-import.js'); const r = await importImages(fs.filter(f => f.type.startsWith('image/'))); insertPages(r.pages, st.page + 1); }
  };
  app.addEventListener('drop', onDrop);

  function renderAll() { renderStrip(); renderTools(); renderTabs(); renderCanvas(); renderPanel(); $('.ed-title').value = book.title; }
  renderAll();

  return { destroy() { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); app.removeEventListener('drop', onDrop); if (dirty) saveNow(); } };
}
