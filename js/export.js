// Export publications as self-contained HTML (single book or a bookshelf), or as project backups.
import { db, collectBlobKeys } from './db.js';
import { esc } from './util.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=Playfair+Display:wght@700&family=Lora:wght@400;600&family=Bebas+Neue&family=Fraunces:wght@600;700&family=Baloo+2:wght@600;700&family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Montserrat:wght@400;600&family=Great+Vibes&family=Cinzel:wght@500;700&display=swap';

const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));

async function runtime() {
  const base = new URL('../dist/', import.meta.url);
  const [js, css] = await Promise.all([fetch(new URL('viewer-runtime.js', base)).then(r => r.text()), fetch(new URL('viewer-runtime.css', base)).then(r => r.text())]);
  return { js: js.replace(/<\/script/gi, '<\\/script'), css };
}

/** Collect a book's binary assets as data URLs (skipping thumbnails unless needed). */
async function packAssets(book, { includePdf = true } = {}) {
  const assets = {};
  for (const k of collectBlobKeys(book)) {
    if (!includePdf && k === book.sourcePdf) continue;
    const b = await db.getBlob(k);
    if (b) assets[k] = await blobToDataUrl(b);
  }
  return assets;
}

function stripForExport(book) {
  const b = structuredClone(book);
  delete b.source;                 // editable source stays in the studio
  b.pages = b.pages.map(p => ({ ...p, words: p.words && p.words.length ? p.words : undefined }));
  return b;
}

const BOOT = `
(function(){
  var data = JSON.parse(document.getElementById('ff-data').textContent);
  var cache = {};
  function url(k){ if(!(k in cache)){ var d = data.assets[k]; if(!d){ cache[k]=null; } else { try { var i=d.indexOf(','), m=d.slice(5,d.indexOf(';')), bin=atob(d.slice(i+1)), a=new Uint8Array(bin.length); for(var j=0;j<bin.length;j++)a[j]=bin.charCodeAt(j); cache[k]=URL.createObjectURL(new Blob([a],{type:m})); } catch(e){ cache[k]=d; } } } return Promise.resolve(cache[k]); }
  function local(ev){ try { var k='ffstats_'+ev.book, a=JSON.parse(localStorage.getItem(k)||'[]'); a.push(Object.assign({ts:Date.now()},ev)); if(a.length>500)a=a.slice(-500); localStorage.setItem(k, JSON.stringify(a)); } catch(e){} }
  window.__ffMount = function(el, book, extra){ return FlipForge.mountViewer(el, book, Object.assign({ mode:'export', assetUrl:url, onEvent:local, qr:function(u){ return FlipForge.qrSvg(u); }, embed: /[?&]embed=1/.test(location.search) }, extra||{})); };
  __FF_START__
})();`;

function page({ title, description, css, js, data, body, start, ogImage }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || title)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="generator" content="FlipForge Studio">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${css}
html,body{margin:0;height:100%;background:#0d0f1a}#app{position:fixed;inset:0}
${body.css || ''}</style>
</head>
<body>
${body.html}
<script type="application/json" id="ff-data">${safeJson(data)}</script>
<script>${js}</script>
<script>${BOOT.replace('__FF_START__', start)}</script>
</body>
</html>`;
}

/** Single publication -> standalone HTML string. */
export async function exportBookHtml(book, { includePdf = true } = {}) {
  const rt = await runtime();
  const b = stripForExport(book);
  b.settings = { ...b.settings, backlink: false };
  const assets = await packAssets(book, { includePdf: includePdf && book.settings.tools?.download });
  const seo = book.pages.map(p => `<section><h2>Page ${book.pages.indexOf(p) + 1}</h2><p>${esc(p.text || '')}</p></section>`).join('');
  return page({
    title: book.title, description: book.settings.seo?.description, css: rt.css, js: rt.js,
    data: { book: b, assets },
    body: { html: `<div id="app"></div><noscript><h1>${esc(book.title)}</h1>${book.settings.seo?.indexable !== false ? seo : ''}</noscript>` },
    start: `__ffMount(document.getElementById('app'), data.book);`,
  });
}

/** Several publications -> one bookshelf website. */
export async function exportShelfHtml(books, { title = 'Our Library', subtitle = '' } = {}) {
  const rt = await runtime();
  const list = [], assets = {};
  for (const bk of books) {
    const b = stripForExport(bk); b.settings = { ...b.settings, backlink: false };
    list.push(b);
    Object.assign(assets, await packAssets(bk, { includePdf: bk.settings.tools?.download }));
    // cover thumbnail for html pages is rendered live; image pages use their thumb
  }
  const css = `
.shelf{min-height:100%;color:#eef0fa;font:15px/1.5 Inter,system-ui,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#2b2f4a,#0d0f1a 70%);padding:48px 20px 80px;box-sizing:border-box}
.shelf h1{font:700 clamp(32px,5vw,56px)/1.05 "Space Grotesk",system-ui;text-align:center;margin:0 0 8px}.shelf>p{text-align:center;color:#9aa0b8;margin:0 0 40px}
.shelf-filter{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:36px}.shelf-filter input{width:min(420px,100%);padding:12px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;font:inherit}
.shelf-row{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:44px 28px;padding:0 10px 26px;border-bottom:14px solid #3a2a1e;box-shadow:0 22px 30px -18px rgba(0,0,0,.8);background:linear-gradient(transparent calc(100% - 2px),rgba(255,255,255,.05) 0)}
.shelf-book{cursor:pointer;background:none;border:0;padding:0;color:inherit;text-align:left;font:inherit}.shelf-cover{aspect-ratio:var(--a);border-radius:3px 8px 8px 3px;overflow:hidden;position:relative;background:#fff;box-shadow:-6px 0 0 rgba(0,0,0,.25) inset,0 16px 26px -8px rgba(0,0,0,.7);transform:perspective(800px) rotateY(-12deg);transform-origin:left;transition:transform .35s}
.shelf-book:hover .shelf-cover,.shelf-book:focus-visible .shelf-cover{transform:perspective(800px) rotateY(-2deg) translateY(-6px)}.shelf-cover img{width:100%;height:100%;object-fit:cover;display:block}.shelf-cover .ff-html{transform-origin:0 0;pointer-events:none}
.shelf-book b{display:block;margin-top:14px;font-weight:600}.shelf-book span{color:#9aa0b8;font-size:13px}
.shelf-reader{position:fixed;inset:0;z-index:50;background:#0d0f1a}.shelf-reader[hidden]{display:none}.shelf-close{position:fixed;z-index:60;top:10px;left:50%;transform:translateX(-50%);border:0;border-radius:999px;padding:8px 16px;background:#6d5efc;color:#fff;font:600 13px Inter,system-ui;cursor:pointer}`;
  const html = `<div class="shelf"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><div class="shelf-filter"><input type="search" placeholder="Search the library…" aria-label="Search the library"></div><div class="shelf-row"></div></div><div class="shelf-reader" hidden><button class="shelf-close">← Back to library</button><div id="app"></div></div>`;
  const start = `
    var row=document.querySelector('.shelf-row'), reader=document.querySelector('.shelf-reader'), viewer=null;
    data.books.forEach(function(b,i){
      var p=b.pages[0], btn=document.createElement('button'); btn.className='shelf-book'; btn.style.setProperty('--a', b.aspect);
      btn.innerHTML='<div class="shelf-cover"></div><b></b><span></span>'; btn.querySelector('b').textContent=b.title; btn.querySelector('span').textContent=b.pages.length+' pages';
      var cov=btn.querySelector('.shelf-cover');
      if(p.kind==='image'){ url(p.thumb||p.image).then(function(u){ var im=new Image(); im.src=u; im.alt=''; cov.appendChild(im); }); }
      else { var d=document.createElement('div'); d.className='ff-html fx-static'; d.innerHTML=p.html; cov.appendChild(d); requestAnimationFrame(function(){ d.style.transform='scale('+(cov.clientWidth/800)+')'; }); }
      btn.onclick=function(){ reader.hidden=false; viewer && viewer.then(function(v){v.destroy();}); viewer=__ffMount(document.getElementById('app'), b, { updateHash:false }); };
      btn.dataset.q=(b.title+' '+b.pages.map(function(x){return x.text||''}).join(' ')).toLowerCase();
      row.appendChild(btn);
    });
    document.querySelector('.shelf-close').onclick=function(){ reader.hidden=true; viewer && viewer.then(function(v){v.destroy();}); viewer=null; };
    document.querySelector('.shelf-filter input').oninput=function(e){ var q=e.target.value.toLowerCase(); row.querySelectorAll('.shelf-book').forEach(function(b){ b.hidden = q && b.dataset.q.indexOf(q)<0; }); };`;
  return page({ title, description: subtitle, css: rt.css, js: rt.js, data: { books: list, assets }, body: { html, css }, start });
}

/** Full-fidelity project backup (re-importable into the studio). */
export async function exportProject(book) {
  const assets = await packAssets(book);
  return JSON.stringify({ format: 'flipforge-project', version: 1, book, assets });
}
export async function importProject(text) {
  const data = JSON.parse(text);
  if (data.format !== 'flipforge-project') throw new Error('Not a FlipForge project file');
  const book = data.book;
  const remap = {};
  for (const [k, durl] of Object.entries(data.assets || {})) {
    const blob = await (await fetch(durl)).blob();
    remap[k] = await db.putBlob(blob);
  }
  const r = (k) => (k && remap[k]) || k;
  book.id = 'bk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  book.title = book.title + (data.keepTitle ? '' : '');
  book.pages = book.pages.map(p => ({ ...p, image: r(p.image), thumb: r(p.thumb) }));
  book.hotspots = (book.hotspots || []).map(h => ({ ...h, data: { ...h.data, blob: r(h.data?.blob), images: (h.data?.images || []).map(r) }, blobs: (h.blobs || []).map(r) }));
  book.sourcePdf = r(book.sourcePdf);
  book.settings.logoBlob = r(book.settings.logoBlob); book.settings.bgBlob = r(book.settings.bgBlob);
  if (book.settings.music) book.settings.music.blob = r(book.settings.music.blob);
  await db.saveBook(book);
  return book;
}

export function download(name, content, type = 'text/html') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const slug = (s) => String(s || 'publication').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'publication';
