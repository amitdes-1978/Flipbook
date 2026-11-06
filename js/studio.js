// FlipForge Studio: app shell, library, creation flows, leads, settings.
import { db, newBook, uid } from './db.js';
import { icon, esc, toast, dialog, confirmDlg, pagePreview, pickFiles, readFileText, timeAgo } from './ui.js';
import { compose, THEMES, SIZES, csvToProducts } from './composer.js';
import { TEMPLATES } from './templates.js';
import { exportBookHtml, exportShelfHtml, exportProject, importProject, download, slug } from './export.js';
import { store } from './util.js';

const app = document.getElementById('studio');
const theme = store.get('ff_theme', 'dark');
document.documentElement.dataset.theme = theme;

/* ---------------- shell ---------------- */
function shell(active, content) {
  app.innerHTML = `
  <div class="studio">
    <div class="mobile-bar"><a class="logo" href="index.html" style="padding:0"><img src="assets/favicon.svg" alt="">FlipForge</a><button class="btn icon" data-menu aria-label="Menu">${icon('list')}</button></div>
    <nav class="side" aria-label="Studio">
      <a class="logo" href="index.html"><img src="assets/favicon.svg" alt="">FlipForge</a>
      <a class="btn primary" href="#/new" style="margin:0 2px 14px">${icon('plus', 18)} Create new</a>
      <div class="nav">
        <a href="#/" class="${active === 'lib' ? 'on' : ''}">${icon('book')} Library</a>
        <a href="#/new" class="${active === 'new' ? 'on' : ''}">${icon('spark')} Create</a>
        <a href="#/templates" class="${active === 'tpl' ? 'on' : ''}">${icon('grid')} Templates</a>
        <a href="#/stats" class="${active === 'stats' ? 'on' : ''}">${icon('chart')} Analytics</a>
        <a href="#/leads" class="${active === 'leads' ? 'on' : ''}">${icon('users')} Leads</a>
        <a href="#/settings" class="${active === 'settings' ? 'on' : ''}">${icon('settings')} Settings</a>
      </div>
      <div class="side-foot">
        <div class="storage" data-storage></div>
        <button class="btn sm" data-theme-toggle>${icon(theme === 'dark' ? 'sun' : 'moon', 16)} ${theme === 'dark' ? 'Light' : 'Dark'} mode</button>
      </div>
    </nav>
    <main class="main" id="main">${content}</main>
  </div>`;
  app.querySelector('[data-theme-toggle]').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('ff_theme', t); location.reload(); };
  app.querySelector('[data-menu]').onclick = () => app.querySelector('.side').classList.toggle('open');
  app.querySelectorAll('.side a').forEach(a => a.addEventListener('click', () => app.querySelector('.side').classList.remove('open')));
  storageInfo();
  return app.querySelector('#main');
}
async function storageInfo() {
  const el = app.querySelector('[data-storage]'); if (!el || !navigator.storage?.estimate) return;
  const { usage = 0, quota = 1 } = await navigator.storage.estimate();
  const mb = (n) => (n / 1048576).toFixed(n > 1e9 ? 0 : 1);
  el.innerHTML = `Storage: ${mb(usage)} MB of ${mb(quota) > 1024 ? (quota / 1073741824).toFixed(1) + ' GB' : mb(quota) + ' MB'}<div class="bar"><i style="width:${Math.min(100, usage / quota * 100).toFixed(1)}%"></i></div>`;
}

/* ---------------- library ---------------- */
async function library() {
  const books = await db.listBooks();
  const leads = await db.leads();
  let views = 0;
  for (const b of books) views += (await db.events(b.id)).filter(e => e.type === 'open').length;
  const shelf = store.get('ff_shelf', false);
  const main = shell('lib', `
    <div class="page-head"><div><h1>Library</h1><p>All your publications, stored privately in this browser.</p></div>
      <div class="row wrap"><button class="btn" data-import>${icon('upload', 16)} Import project</button>${books.length > 1 ? `<button class="btn" data-shelf-export>${icon('book', 16)} Export bookshelf site</button>` : ''}<a class="btn primary" href="#/new">${icon('plus', 16)} New publication</a></div></div>
    <div class="content">
      <div class="tiles">
        <div class="tile"><span>Publications</span><b>${books.length}</b><small>${books.reduce((s, b) => s + b.pages.length, 0)} pages total</small></div>
        <div class="tile"><span>Reader sessions</span><b>${views}</b><small>tracked on this device</small></div>
        <div class="tile"><span>Leads captured</span><b>${leads.length}</b><small><a href="#/leads">View leads →</a></small></div>
        <div class="tile"><span>Interactive elements</span><b>${books.reduce((s, b) => s + (b.hotspots || []).length, 0)}</b><small>links, media, quizzes…</small></div>
      </div>
      ${books.length ? `
      <div class="lib-tools"><input class="input" type="search" placeholder="Search publications…" data-q aria-label="Search publications">
        <div class="seg"><button class="${shelf ? '' : 'on'}" data-view="grid">Grid</button><button class="${shelf ? 'on' : ''}" data-view="shelf">Bookshelf</button></div>
        <select class="input" style="max-width:180px" data-sort aria-label="Sort"><option value="updated">Recently edited</option><option value="title">Title A–Z</option><option value="pages">Most pages</option></select></div>
      <div class="${shelf ? 'shelf-view' : ''}"><div class="books" data-books></div></div>` : `
      <div class="empty">${icon('book', 46)}<h2>Create your first interactive publication</h2><p>Upload a PDF, start from a template, write your own or let AI draft it.</p><p style="margin-top:20px"><a class="btn primary lg" href="#/new">${icon('spark', 18)} Get started</a></p></div>`}
    </div>`);
  main.querySelector('[data-import]').onclick = async () => {
    const [f] = await pickFiles({ accept: '.json,.flipforge' }); if (!f) return;
    try { const b = await importProject(await readFileText(f)); toast(`Imported “${b.title}”`); library(); } catch (e) { toast(e.message, true); }
  };
  const se = main.querySelector('[data-shelf-export]');
  if (se) se.onclick = () => shelfDialog(books);
  if (!books.length) return;
  const grid = main.querySelector('[data-books]');
  const render = () => {
    const q = main.querySelector('[data-q]').value.toLowerCase();
    const sort = main.querySelector('[data-sort]').value;
    const list = books.filter(b => !q || b.title.toLowerCase().includes(q) || b.type.includes(q))
      .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'pages' ? b.pages.length - a.pages.length : b.updatedAt - a.updatedAt);
    grid.innerHTML = list.map(b => `
      <article class="book-card" data-id="${b.id}">
        <button class="book-cover" data-open aria-label="Edit ${esc(b.title)}"><div class="cv" style="--a:${b.aspect}"></div></button>
        <div class="book-meta"><h3>${esc(b.title)}</h3><div class="row"><span class="pill">${esc(b.type)}</span><span class="faint" style="font-size:12px">${b.pages.length} pages · ${timeAgo(b.updatedAt)}</span></div></div>
        <div class="book-actions">
          <button class="btn sm" data-open>${icon('edit', 15)} Edit</button>
          <a class="btn sm ghost" href="viewer.html?id=${b.id}" target="_blank" title="Open reader">${icon('eye', 15)}</a>
          <a class="btn sm ghost" href="#/stats/${b.id}" title="Analytics">${icon('chart', 15)}</a>
          <button class="btn sm ghost" data-more title="More">${icon('more', 15)}</button>
        </div>
      </article>`).join('');
    grid.querySelectorAll('.book-card').forEach(card => {
      const b = books.find(x => x.id === card.dataset.id);
      pagePreview(card.querySelector('.cv'), b.pages[0]);
      card.querySelectorAll('[data-open]').forEach(el => el.onclick = () => location.hash = '#/edit/' + b.id);
      card.querySelector('[data-more]').onclick = () => bookMenu(b);
    });
  };
  main.querySelector('[data-q]').oninput = render;
  main.querySelector('[data-sort]').onchange = render;
  main.querySelectorAll('[data-view]').forEach(bt => bt.onclick = () => { store.set('ff_shelf', bt.dataset.view === 'shelf'); library(); });
  render();
}

function bookMenu(b) {
  const { el, close } = dialog(`<h2>${esc(b.title)}</h2><p class="dlg-sub">${b.pages.length} pages · created ${new Date(b.createdAt).toLocaleDateString()}</p>
    <div class="create-grid" style="grid-template-columns:1fr 1fr;margin:0">
      <button class="create-card" data-a="html"><div class="cc-ico">${icon('download')}</div><h3>Export website</h3><p>Single self-contained HTML file. Upload anywhere.</p></button>
      <button class="create-card" data-a="json"><div class="cc-ico">${icon('copy')}</div><h3>Backup project</h3><p>Re-importable .flipforge.json with all assets.</p></button>
      <button class="create-card" data-a="dup"><div class="cc-ico">${icon('plus')}</div><h3>Duplicate</h3><p>Make an editable copy.</p></button>
      <button class="create-card" data-a="del"><div class="cc-ico" style="color:var(--bad)">${icon('trash')}</div><h3>Delete</h3><p>Remove the publication and its stats.</p></button>
    </div>`);
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'html') { toast('Packaging…'); download(slug(b.title) + '.html', await exportBookHtml(b)); }
    if (a === 'json') { toast('Packaging…'); download(slug(b.title) + '.flipforge.json', await exportProject(b), 'application/json'); }
    if (a === 'dup') { const text = await exportProject(b); const c = await importProject(text); c.title = b.title + ' (copy)'; await db.saveBook(c); close(); library(); toast('Duplicated'); }
    if (a === 'del') { close(); if (await confirmDlg('Delete publication?', `“${b.title}” and its analytics will be permanently removed from this browser.`)) { await db.deleteBook(b.id); toast('Deleted'); library(); } }
  });
}

function shelfDialog(books) {
  const { el, close } = dialog(`<h2>Export a bookshelf website</h2><p class="dlg-sub">Bundle several publications into one searchable library page — perfect for catalogs archives, school libraries or magazine back issues.</p>
    <label class="field"><span>Library title</span><input data-t value="Our Library"></label>
    <label class="field"><span>Subtitle</span><input data-s value="Browse our publications"></label>
    <div class="field"><span>Publications</span>${books.map(b => `<label class="check"><input type="checkbox" value="${b.id}" checked> ${esc(b.title)} <span class="faint">(${b.pages.length} p)</span></label>`).join('')}</div>
    <div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>${icon('download', 16)} Export</button></div>`);
  el.querySelector('[data-go]').onclick = async () => {
    const ids = [...el.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
    if (!ids.length) return toast('Select at least one publication', true);
    toast('Packaging bookshelf…');
    const html = await exportShelfHtml(books.filter(b => ids.includes(b.id)), { title: el.querySelector('[data-t]').value, subtitle: el.querySelector('[data-s]').value });
    download(slug(el.querySelector('[data-t]').value) + '.html', html); close();
  };
}

/* ---------------- create ---------------- */
function createView() {
  const main = shell('new', `
    <div class="page-head"><div><h1>Create a publication</h1><p>Start from a file, a template, your own words or AI.</p></div></div>
    <div class="content">
      <div class="create-grid">
        <button class="create-card" data-c="pdf"><div class="cc-ico">${icon('upload')}</div><h3>Upload PDF</h3><p>Convert one or many PDFs (batch) into flipbooks. Links and outline are detected automatically.</p></button>
        <button class="create-card hot" data-c="ai"><div class="cc-ico">${icon('wand')}</div><h3>Generate with AI</h3><p>Describe a topic — Claude writes a complete interactive ebook, course, report or magazine.</p></button>
        <button class="create-card" data-c="tpl"><div class="cc-ico">${icon('grid')}</div><h3>Start from a template</h3><p>${TEMPLATES.length} designed starters: ebook, magazine, catalog, menu, report, course…</p></button>
        <button class="create-card" data-c="write"><div class="cc-ico">${icon('edit')}</div><h3>Write from scratch</h3><p>Type or paste text; pages, typography and contents are laid out for you.</p></button>
        <button class="create-card" data-c="images"><div class="cc-ico">${icon('image')}</div><h3>Photo book / scans</h3><p>Turn JPG, PNG or WebP images into a page-flip album or portfolio.</p></button>
        <button class="create-card" data-c="csv"><div class="cc-ico">${icon('product')}</div><h3>Catalog from spreadsheet</h3><p>Import a CSV of products and get a shoppable catalog with cart & ordering.</p></button>
        <button class="create-card" data-c="doc"><div class="cc-ico">${icon('page')}</div><h3>Text / Markdown / HTML file</h3><p>Import .txt, .md or .html documents and typeset them as a book.</p></button>
        <button class="create-card" data-c="import"><div class="cc-ico">${icon('copy')}</div><h3>Import project</h3><p>Restore a .flipforge.json backup.</p></button>
      </div>
    </div>`);
  main.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c; if (!c) return;
    ({ pdf: pdfFlow, ai: aiFlow, tpl: () => location.hash = '#/templates', write: () => writeFlow(), images: imagesFlow, csv: csvFlow, doc: docFlow, import: async () => { const [f] = await pickFiles({ accept: '.json' }); if (f) { const b = await importProject(await readFileText(f)); location.hash = '#/edit/' + b.id; } } })[c]();
  });
}

async function pdfFlow(files) {
  if (!files) files = await pickFiles({ accept: 'application/pdf', multiple: true });
  files = (files || []).filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (!files.length) return;
  const { el, close } = dialog(`<h2>Converting ${files.length > 1 ? files.length + ' PDFs' : 'PDF'}</h2><p class="dlg-sub" data-label>Preparing…</p>
    <div class="field"><span>Quality</span><div class="seg" data-q><button data-v="standard">Standard</button><button data-v="high" class="on">High</button><button data-v="ultra">Ultra (print)</button></div></div>
    <div class="progress"><i></i></div><div class="thumbs-strip"></div>
    <div class="dlg-foot"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-start>Start conversion</button></div>`, { dismissable: false });
  let quality = 'high';
  el.querySelectorAll('[data-q] button').forEach(b => b.onclick = () => { quality = b.dataset.v; el.querySelectorAll('[data-q] button').forEach(x => x.classList.toggle('on', x === b)); });
  const ac = new AbortController();
  el.querySelector('[data-cancel]').onclick = () => { ac.abort(); close(); };
  el.querySelector('[data-start]').onclick = async () => {
    el.querySelector('[data-start]').disabled = true; el.querySelector('[data-q]').closest('.field').hidden = true;
    const { importPdf } = await import('./pdf-import.js');
    const made = [];
    try {
      for (const [k, f] of files.entries()) {
        el.querySelector('[data-label]').textContent = `${f.name} (${k + 1}/${files.length})`;
        const r = await importPdf(f, { quality, signal: ac.signal, onProgress: (d, t, thumb) => {
          el.querySelector('.progress i').style.width = ((k + d / t) / files.length * 100) + '%';
          el.querySelector('[data-label]').textContent = `${f.name} — page ${d} of ${t}`;
          const im = new Image(); im.src = thumb; el.querySelector('.thumbs-strip').appendChild(im);
        } });
        const b = newBook({ title: r.title, type: 'ebook', aspect: r.aspect });
        b.pages = r.pages; b.hotspots = r.hotspots; b.sourcePdf = r.sourcePdf; b.settings.toc = r.outline;
        b.settings.tools.download = true;
        await db.saveBook(b); made.push(b);
      }
      close();
      toast(`Created ${made.length} flipbook${made.length > 1 ? 's' : ''}`);
      location.hash = made.length === 1 ? '#/edit/' + made[0].id : '#/';
    } catch (e) { if (e.name !== 'AbortError') { console.error(e); toast('Conversion failed: ' + e.message, true); close(); } }
  };
}

async function imagesFlow() {
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  if (!files.length) return;
  const { el, close } = dialog(`<h2>Building photo book</h2><p class="dlg-sub" data-label>0 / ${files.length}</p><div class="progress"><i></i></div><div class="thumbs-strip"></div>`, { dismissable: false });
  const { importImages } = await import('./pdf-import.js');
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const r = await importImages(files, { onProgress: (d, t, th) => { el.querySelector('.progress i').style.width = d / t * 100 + '%'; el.querySelector('[data-label]').textContent = `${d} / ${t}`; const im = new Image(); im.src = th; el.querySelector('.thumbs-strip').appendChild(im); } });
  const b = newBook({ title: 'Photo book', type: 'album', aspect: r.aspect });
  b.pages = r.pages; b.settings.hardcover = true;
  await db.saveBook(b); close(); location.hash = '#/edit/' + b.id;
}

async function composedBook({ md, theme, size, type, title }) {
  const aspect = SIZES.find(s => s.id === size)?.aspect || 0.7071;
  const r = compose(md, { theme, aspect });
  const b = newBook({ title: title || r.meta.title || 'Untitled', type, aspect });
  b.pages = r.pages; b.settings.toc = r.toc;
  b.source = { markdown: md, theme: r.theme, size };
  if (type === 'catalog' || type === 'menu') b.settings.shop = { email: '', whatsapp: '' };
  await db.saveBook(b);
  return b;
}

function templatesView() {
  const main = shell('tpl', `
    <div class="page-head"><div><h1>Templates</h1><p>Pick a starter, then make it yours: swap theme, size, text, media and interactivity.</p></div></div>
    <div class="content">
      <div class="row wrap" style="margin-bottom:18px"><span class="muted" style="font-size:13px">Theme preview:</span><div class="seg" data-th><button class="on" data-v="">Default</button>${THEMES.map(t => `<button data-v="${t.id}">${t.name}</button>`).join('')}</div></div>
      <div class="tpl-grid" data-grid></div>
    </div>`);
  let themeOverride = '';
  const render = () => {
    const g = main.querySelector('[data-grid]');
    g.innerHTML = TEMPLATES.map(t => { const a = SIZES.find(s => s.id === t.size).aspect; return `<button class="tpl" data-id="${t.id}"><div class="tp"><div class="cv" style="--a:${a}"></div></div><div class="tm"><b>${t.icon} ${esc(t.name)}</b><span>${esc(t.blurb)}</span></div></button>`; }).join('');
    g.querySelectorAll('.tpl').forEach(btn => {
      const t = TEMPLATES.find(x => x.id === btn.dataset.id);
      const a = SIZES.find(s => s.id === t.size).aspect;
      const first = compose(t.md.split('\n# ')[0], { theme: themeOverride || t.theme, aspect: a, toc: false, back: false }).pages[0];
      pagePreview(btn.querySelector('.cv'), first);
      btn.onclick = async () => { const b = await composedBook({ md: t.md, theme: themeOverride || t.theme, size: t.size, type: t.type }); toast('Created from template'); location.hash = '#/edit/' + b.id; };
    });
  };
  main.querySelectorAll('[data-th] button').forEach(b => b.onclick = () => { themeOverride = b.dataset.v; main.querySelectorAll('[data-th] button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  render();
}

function writeFlow(prefill = '', opts = {}) {
  const md = prefill || TEMPLATES.find(t => t.id === 'blank').md;
  const { el, close } = dialog(`<h2>${opts.heading || 'Write your publication'}</h2><p class="dlg-sub">Paste or type content. Use <code>#</code> for chapters — see the block reference in the editor's Content tab.</p>
    <div class="grid2"><label class="field"><span>Theme</span><select data-theme>${THEMES.map(t => `<option value="${t.id}" ${t.id === (opts.theme || 'aurora') ? 'selected' : ''}>${t.name} — ${t.desc}</option>`).join('')}</select></label>
    <label class="field"><span>Page size</span><select data-size>${SIZES.map(s => `<option value="${s.id}" ${s.id === (opts.size || 'a4') ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label></div>
    <label class="field"><span>Content</span><textarea class="code" rows="16" data-md>${esc(md)}</textarea></label>
    <div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>${icon('check', 16)} Create publication</button></div>`, { wide: true });
  el.querySelector('[data-go]').onclick = async () => {
    const b = await composedBook({ md: el.querySelector('[data-md]').value, theme: el.querySelector('[data-theme]').value, size: el.querySelector('[data-size]').value, type: opts.type || 'ebook' });
    close(); location.hash = '#/edit/' + b.id;
  };
}

async function docFlow() {
  const [f] = await pickFiles({ accept: '.txt,.md,.markdown,.html,.htm' }); if (!f) return;
  let text = await readFileText(f);
  if (/\.html?$/i.test(f.name)) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const out = [];
    doc.body.querySelectorAll('h1,h2,h3,p,li,blockquote,img').forEach(n => {
      const t = n.textContent.trim();
      if (n.tagName === 'H1') out.push('# ' + t); else if (n.tagName === 'H2') out.push('## ' + t); else if (n.tagName === 'H3') out.push('### ' + t);
      else if (n.tagName === 'LI') out.push('- ' + t); else if (n.tagName === 'BLOCKQUOTE') out.push('> ' + t);
      else if (n.tagName === 'IMG' && /^https?:/.test(n.src)) out.push(`![${n.alt || ''}](${n.src})`); else if (t) out.push(t);
      out.push('');
    });
    text = `title: ${doc.title || f.name}\n\n` + out.join('\n');
  } else if (!/^\w+\s*:/.test(text)) text = `title: ${f.name.replace(/\.\w+$/, '')}\n\n` + text;
  writeFlow(text, { heading: 'Review imported document' });
}

function csvFlow() {
  const sample = 'name,price,image,description,url,sku,category\nAurora Lamp,$89,,Dimmable LED with walnut base,https://example.com/lamp,L-01,Lighting\nNova Pendant,$149,,Hand-blown glass shade,https://example.com/pendant,L-02,Lighting\nOak Side Table,$210,,Solid oak with oil finish,https://example.com/table,F-01,Furniture\nLinen Armchair,$640,,Stone-washed linen,https://example.com/chair,F-02,Furniture';
  const { el, close } = dialog(`<h2>Catalog from spreadsheet</h2><p class="dlg-sub">Columns: <code>name, price, image, description, url, sku, category</code>. Export from Excel / Google Sheets as CSV. Each category becomes a section.</p>
    <div class="row" style="margin-bottom:10px"><button class="btn sm" data-file>${icon('upload', 15)} Load CSV file</button><span class="faint" style="font-size:12px">or paste below</span></div>
    <label class="field"><span>CSV data</span><textarea class="code" rows="9" data-csv>${esc(sample)}</textarea></label>
    <div class="grid2"><label class="field"><span>Catalog title</span><input data-title value="Product Catalog 2026"></label><label class="field"><span>Brand / subtitle</span><input data-sub value="Spring collection"></label></div>
    <div class="grid2"><label class="field"><span>Orders by email (optional)</span><input data-email type="email" placeholder="orders@yourshop.com"></label><label class="field"><span>Orders by WhatsApp (optional)</span><input data-wa placeholder="+15551234567"></label></div>
    <div class="grid2"><label class="field"><span>Theme</span><select data-theme>${THEMES.map(t => `<option value="${t.id}" ${t.id === 'luxe' ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label><label class="field"><span>Page size</span><select data-size>${SIZES.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label></div>
    <div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Create catalog</button></div>`, { wide: true });
  el.querySelector('[data-file]').onclick = async () => { const [f] = await pickFiles({ accept: '.csv,.tsv,.txt' }); if (f) el.querySelector('[data-csv]').value = await readFileText(f); };
  el.querySelector('[data-go]').onclick = async () => {
    const md = `title: ${el.querySelector('[data-title]').value}\nsubtitle: ${el.querySelector('[data-sub]').value}\nkicker: Catalog\n\n` + csvToProducts(el.querySelector('[data-csv]').value);
    const b = await composedBook({ md, theme: el.querySelector('[data-theme]').value, size: el.querySelector('[data-size]').value, type: 'catalog' });
    b.settings.shop = { email: el.querySelector('[data-email]').value, whatsapp: el.querySelector('[data-wa]').value };
    await db.saveBook(b); close(); location.hash = '#/edit/' + b.id;
  };
}

async function aiFlow() {
  const ai = await import('./ai.js');
  const key = await ai.getKey();
  const { el, close } = dialog(`<h2>${icon('wand')} Generate with AI</h2><p class="dlg-sub">Claude writes the full publication — chapters, quizzes, charts and calls to action — then FlipForge designs the pages.</p>
    ${key ? '' : `<label class="field"><span>Anthropic API key</span><input type="password" data-key placeholder="sk-ant-…" autocomplete="off"><small>Stored only in this browser and sent directly to api.anthropic.com. Get one at console.anthropic.com.</small></label>`}
    <label class="field"><span>What should it be about?</span><textarea rows="3" data-topic placeholder="e.g. A beginner's guide to sourdough baking at home"></textarea></label>
    <div class="grid2">
      <label class="field"><span>Publication type</span><select data-type><option>ebook</option><option>online course workbook with quizzes</option><option>magazine issue</option><option>annual report</option><option>sales proposal</option><option>product brochure</option><option>employee handbook</option><option>newsletter</option><option>cookbook</option><option>travel guide</option><option>children's story book</option><option>case study</option></select></label>
      <label class="field"><span>Audience</span><input data-aud placeholder="e.g. busy parents, CTOs, grade 5 students"></label>
      <label class="field"><span>Tone</span><select data-tone><option>friendly and practical</option><option>professional and concise</option><option>inspiring and story-driven</option><option>playful</option><option>academic</option><option>luxurious</option></select></label>
      <label class="field"><span>Length (chapters)</span><select data-len><option>3</option><option selected>5</option><option>7</option><option>10</option></select></label>
      <label class="field"><span>Language</span><input data-lang value="English"></label>
      <label class="field"><span>Theme</span><select data-theme>${THEMES.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Extra instructions (optional)</span><input data-extra placeholder="Include a checklist at the end; mention our brand 'Crust & Co'"></label>
    <label class="field"><span>Source material (optional)</span><textarea rows="3" data-src placeholder="Paste notes, an article or existing text to build from…"></textarea></label>
    <div class="ai-out" data-out hidden></div>
    <div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>${icon('spark', 16)} Generate</button></div>`, { wide: true, dismissable: true });
  let ac = null;
  el.querySelector('[data-go]').onclick = async () => {
    const go = el.querySelector('[data-go]');
    const apiKey = el.querySelector('[data-key]')?.value.trim() || key;
    const topic = el.querySelector('[data-topic]').value.trim();
    if (!apiKey) return toast('Add your Anthropic API key', true);
    if (!topic) return toast('Describe the topic first', true);
    if (el.querySelector('[data-key]')) await ai.setKey(apiKey);
    const out = el.querySelector('[data-out]'); out.hidden = false; out.textContent = 'Thinking…';
    go.disabled = true; go.textContent = 'Writing…';
    ac = new AbortController();
    try {
      const md = await ai.generatePublication({ apiKey, topic, type: el.querySelector('[data-type]').value, audience: el.querySelector('[data-aud]').value, tone: el.querySelector('[data-tone]').value, length: el.querySelector('[data-len]').value, language: el.querySelector('[data-lang]').value, extras: el.querySelector('[data-extra]').value, sourceText: el.querySelector('[data-src]').value }, { signal: ac.signal, onText: (t) => { out.textContent = t; out.scrollTop = out.scrollHeight; } });
      const type = el.querySelector('[data-type]').value.split(' ')[0];
      const b = await composedBook({ md, theme: el.querySelector('[data-theme]').value, size: type === 'sales' ? 'landscape' : type === 'magazine' ? 'letter' : 'a4', type: ['magazine', 'annual', 'sales', 'product', 'newsletter', 'cookbook'].includes(type) ? { annual: 'report', sales: 'proposal', product: 'brochure' }[type] || type : 'ebook' });
      close(); toast('Your publication is ready'); location.hash = '#/edit/' + b.id;
    } catch (e) { toast(ai.friendlyError(e), true); go.disabled = false; go.textContent = 'Try again'; }
  };
}

/* ---------------- leads ---------------- */
async function leadsView() {
  const [leads, books] = await Promise.all([db.leads(), db.listBooks()]);
  const title = (id) => books.find(b => b.id === id)?.title || '(deleted)';
  const cols = [...new Set(leads.flatMap(l => Object.keys(l)).filter(k => !['id', 'book', 'ts', 'page'].includes(k)))];
  const main = shell('leads', `
    <div class="page-head"><div><h1>Leads</h1><p>Contacts captured by lead forms in your publications (on this device, plus any sent to your webhook).</p></div>
    ${leads.length ? `<button class="btn" data-csv>${icon('download', 16)} Export CSV</button>` : ''}</div>
    <div class="content">${leads.length ? `<div class="card" style="overflow:auto"><table class="t"><thead><tr><th>Date</th><th>Publication</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Page</th><th></th></tr></thead><tbody>
      ${leads.sort((a, b) => b.ts - a.ts).map(l => `<tr><td>${new Date(l.ts).toLocaleString()}</td><td>${esc(title(l.book))}</td>${cols.map(c => `<td>${esc(l[c] || '')}</td>`).join('')}<td>${(l.page ?? 0) + 1}</td><td><button class="btn sm ghost" data-del="${l.id}" aria-label="Delete">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">${icon('users', 40)}<h2>No leads yet</h2><p>Turn on the lead form in a publication (Editor → Settings → Lead capture) to start collecting contacts.</p></div>`}</div>`);
  main.querySelector('[data-csv]')?.addEventListener('click', () => {
    const rows = [['date', 'publication', ...cols, 'page'], ...leads.map(l => [new Date(l.ts).toISOString(), title(l.book), ...cols.map(c => l[c] || ''), (l.page ?? 0) + 1])];
    download('leads.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await db.deleteLead(+b.dataset.del); leadsView(); });
}

/* ---------------- settings ---------------- */
async function settingsView() {
  const ai = await import('./ai.js');
  const key = await ai.getKey();
  const main = shell('settings', `
    <div class="page-head"><div><h1>Settings</h1><p>Preferences for this browser.</p></div></div>
    <div class="content" style="max-width:720px">
      <div class="card" style="padding:20px;margin-bottom:18px"><h3 style="margin-top:0">${icon('wand')} AI writer</h3>
        <label class="field"><span>Anthropic API key</span><input type="password" data-key value="${esc(key)}" placeholder="sk-ant-…" autocomplete="off"><small>Used by “Generate with AI” and the AI assistant in the editor (model: ${ai.MODEL}). Stored in this browser only; requests go directly from your browser to Anthropic.</small></label>
        <div class="row"><button class="btn primary" data-save>Save key</button>${key ? '<button class="btn danger" data-clear>Remove key</button>' : ''}</div></div>
      <div class="card" style="padding:20px;margin-bottom:18px"><h3 style="margin-top:0">${icon('copy')} Backup & restore</h3>
        <p class="muted">Everything lives in this browser's storage. Back up regularly, or move your work to another computer.</p>
        <div class="row wrap"><button class="btn" data-backup>${icon('download', 16)} Back up all publications</button><button class="btn" data-restore>${icon('upload', 16)} Restore backup</button></div></div>
      <div class="card" style="padding:20px"><h3 style="margin-top:0">${icon('trash')} Danger zone</h3><button class="btn danger" data-wipe>Delete all data in this browser</button></div>
    </div>`);
  main.querySelector('[data-save]').onclick = async () => { await ai.setKey(main.querySelector('[data-key]').value); toast('Saved'); };
  main.querySelector('[data-clear]')?.addEventListener('click', async () => { await ai.setKey(''); settingsView(); });
  main.querySelector('[data-backup]').onclick = async () => {
    const books = await db.listBooks(); toast('Packaging…');
    const all = [];
    for (const b of books) all.push(JSON.parse(await exportProject(b)));
    download('flipforge-backup.json', JSON.stringify({ format: 'flipforge-backup', projects: all }), 'application/json');
  };
  main.querySelector('[data-restore]').onclick = async () => {
    const [f] = await pickFiles({ accept: '.json' }); if (!f) return;
    const data = JSON.parse(await readFileText(f));
    const list = data.format === 'flipforge-backup' ? data.projects : [data];
    for (const p of list) await importProject(JSON.stringify(p));
    toast(`Restored ${list.length} publication(s)`);
  };
  main.querySelector('[data-wipe]').onclick = async () => {
    if (!(await confirmDlg('Delete everything?', 'All publications, analytics and leads in this browser will be erased. This cannot be undone.', 'Erase all'))) return;
    indexedDB.deleteDatabase('flipforge'); location.hash = '#/'; location.reload();
  };
}

/* ---------------- router ---------------- */
let current = null;
async function route() {
  if (current?.destroy) { try { current.destroy(); } catch { /* ignore */ } }
  current = null;
  const h = location.hash.replace(/^#\/?/, '');
  const [view, id] = h.split('/');
  window.scrollTo(0, 0);
  try {
    if (view === 'edit' && id) { const { openEditor } = await import('./editor.js'); current = await openEditor(app, id); }
    else if (view === 'stats') { const { analyticsView } = await import('./analytics.js'); await analyticsView(shell, id); }
    else if (view === 'new') createView();
    else if (view === 'templates') templatesView();
    else if (view === 'leads') await leadsView();
    else if (view === 'settings') await settingsView();
    else await library();
  } catch (e) { console.error(e); toast('Something went wrong: ' + e.message, true); }
}
window.addEventListener('hashchange', route);

// global drag & drop of PDFs onto the studio
window.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  const files = [...e.dataTransfer.files];
  if (location.hash.startsWith('#/edit')) return;   // editor handles its own drops
  if (files.some(f => /\.pdf$/i.test(f.name))) { e.preventDefault(); pdfFlow(files); }
});

export { shell, pdfFlow, writeFlow, composedBook, uid };
route();
