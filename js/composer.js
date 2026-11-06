// Composer: turns lightweight markdown (+ interactive "@blocks") into designed, paginated HTML pages.
import { uid } from './db.js';
import { esc, videoEmbed } from './util.js';
export { esc, videoEmbed };

export const THEMES = [
  { id: 'aurora', name: 'Aurora', desc: 'Modern gradient tech' },
  { id: 'classic', name: 'Classic', desc: 'Serif book typography' },
  { id: 'editorial', name: 'Editorial', desc: 'Bold magazine look' },
  { id: 'minimal', name: 'Minimal', desc: 'Quiet & clean' },
  { id: 'noir', name: 'Noir', desc: 'Dark with gold accents' },
  { id: 'corporate', name: 'Corporate', desc: 'Reports & proposals' },
  { id: 'fresh', name: 'Fresh', desc: 'Organic greens' },
  { id: 'playful', name: 'Playful', desc: 'Kids & education' },
  { id: 'luxe', name: 'Luxe', desc: 'Premium catalogs & menus' },
];

export const SIZES = [
  { id: 'a4', name: 'A4 portrait', aspect: 0.7071 },
  { id: 'letter', name: 'US Letter', aspect: 0.7727 },
  { id: 'square', name: 'Square', aspect: 1 },
  { id: 'landscape', name: 'Landscape', aspect: 1.4142 },
  { id: 'story', name: 'Mobile story 9:16', aspect: 0.5625 },
  { id: 'pocket', name: 'Pocket book', aspect: 0.65 },
];

/* ---------------- helpers ---------------- */
function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
      if (/^#page=(\d+)$/.test(url)) return `<a href="${url}" data-goto="${url.slice(6)}">${txt}</a>`;
      return /^(https?:|mailto:|tel:)/.test(url) ? `<a href="${url}" target="_blank" rel="noopener">${txt}</a>` : txt;
    });
  return t;
}
const safeUrl = (u) => (/^(https?:|data:image\/|blob:)/i.test(String(u||'').trim()) ? String(u).trim() : '');

/** Deterministic abstract artwork (SVG data URI) so templates look designed without external assets. */
export function art(seed = 'x', label = '', palette) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pals = [['#6d5efc', '#18c6d6', '#241b6b'], ['#ff5fa2', '#ffb84d', '#7b2ff7'], ['#0f9d74', '#c5e86c', '#0d4d3b'], ['#e63946', '#f4a261', '#1d3557'], ['#d4af6a', '#3b2f1d', '#f1d9a5'], ['#0a66c2', '#00a3a3', '#0b2545']];
  const p = palette || pals[Math.floor(rnd() * pals.length)];
  let shapes = '';
  for (let i = 0; i < 7; i++) {
    const cx = Math.round(rnd() * 800), cy = Math.round(rnd() * 600), r = Math.round(80 + rnd() * 260);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p[i % 3]}" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><filter id="b"><feGaussianBlur stdDeviation="40"/></filter><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[2]}"/><stop offset="1" stop-color="${p[0]}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g filter="url(#b)">${shapes}</g>${label ? `<text x="40" y="560" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,.85)">${esc(label)}</text>` : ''}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const img = (u, seed) => safeUrl(u) || art(seed || u || 'img');


function chartSvg(items, accent = 'var(--c-accent)') {
  const max = Math.max(1, ...items.map(i => i.v));
  const bw = 600 / items.length;
  let bars = '';
  items.forEach((it, i) => {
    const h = Math.round((it.v / max) * 200);
    const x = Math.round(i * bw + bw * 0.18), w = Math.round(bw * 0.64);
    bars += `<rect x="${x}" y="${230 - h}" width="${w}" height="${h}" rx="8" fill="${accent}" opacity="${0.55 + 0.45 * (it.v / max)}"/>`
      + `<text x="${x + w / 2}" y="${222 - h}" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">${esc(it.v)}</text>`
      + `<text x="${x + w / 2}" y="254" text-anchor="middle" font-size="14" fill="currentColor" opacity=".65">${esc(it.l)}</text>`;
  });
  return `<svg viewBox="0 0 600 262" role="img"><line x1="0" y1="230.5" x2="600" y2="230.5" stroke="currentColor" opacity=".2"/>${bars}</svg>`;
}

/* ---------------- parsing ---------------- */
export function parseDoc(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const meta = {};
  let i = 0;
  // front matter: key: value lines at top, terminated by blank line or '---'
  if (/^\w+\s*:/.test(lines[0] || '')) {
    for (; i < lines.length; i++) {
      const m = lines[i].match(/^(\w+)\s*:\s*(.*)$/);
      if (!m) { if (lines[i].trim() === '---' || lines[i].trim() === '') i++; break; }
      meta[m[1].toLowerCase()] = m[2].trim();
    }
  }
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', text: para.join(' ') }); para = []; } };
  for (; i < lines.length; i++) {
    const L = lines[i], T = L.trim();
    if (!T) { flush(); continue; }
    let m;
    if (T === '---' || T === '\\pagebreak') { flush(); blocks.push({ t: 'break' }); continue; }
    if ((m = T.match(/^#\s+(.+)/))) { flush(); blocks.push({ t: 'chapter', text: m[1] }); continue; }
    if ((m = T.match(/^##\s+(.+)/))) { flush(); blocks.push({ t: 'h2', text: m[1] }); continue; }
    if ((m = T.match(/^###\s+(.+)/))) { flush(); blocks.push({ t: 'h3', text: m[1] }); continue; }
    if ((m = T.match(/^>\s?(.*)/))) { flush(); const q = [m[1]]; while (lines[i + 1] && /^>/.test(lines[i + 1].trim())) q.push(lines[++i].trim().replace(/^>\s?/, '')); blocks.push({ t: 'quote', text: q.join(' ') }); continue; }
    if ((m = T.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) { flush(); blocks.push({ t: 'img', alt: m[1], src: m[2] }); continue; }
    if (/^([-*+]|\d+[.)])\s+/.test(T)) {
      flush(); const ordered = /^\d/.test(T); const items = [];
      while (i < lines.length && /^([-*+]|\d+[.)])\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^([-*+]|\d+[.)])\s+/, ''));
      i--; blocks.push({ t: 'list', ordered, items }); continue;
    }
    if (/^:::\s*\w*/.test(T)) { flush(); const body = []; while (++i < lines.length && lines[i].trim() !== ':::') body.push(lines[i].trim()); blocks.push({ t: 'note', text: body.join(' ') }); continue; }
    if ((m = T.match(/^@(\w+)\s*(.*)$/))) {
      flush();
      const kind = m[1].toLowerCase(), args = m[2].split('|').map(s => s.trim());
      blocks.push({ t: '@' + kind, args });
      continue;
    }
    para.push(T);
  }
  flush();
  return { meta, blocks };
}

/* ---------------- block rendering ---------------- */
export function blockHtml(b, ctx = {}) {
  const A = 'fx-anim';
  switch (b.t) {
    case 'p': return `<p class="${A}">${inline(b.text)}</p>`;
    case 'h2': return `<h2 class="${A}">${inline(b.text)}</h2>`;
    case 'h3': return `<h3 class="${A}">${inline(b.text)}</h3>`;
    case 'quote': return `<blockquote class="${A}">${inline(b.text)}</blockquote>`;
    case 'note': return `<div class="fx-note ${A}">${inline(b.text)}</div>`;
    case 'list': { const tag = b.ordered ? 'ol' : 'ul'; return `<${tag} class="${A}"${b.start ? ` start="${b.start}"` : ''}>${b.items.map(x => `<li>${inline(x)}</li>`).join('')}</${tag}>`; }
    case 'img': return `<figure class="${A}"><img class="fx-img" src="${esc(img(b.src, b.alt))}" alt="${esc(b.alt)}">${b.alt ? `<figcaption>${esc(b.alt)}</figcaption>` : ''}</figure>`;
    case '@video': {
      const [url, caption] = b.args; const e = videoEmbed(url, true);
      const poster = e.poster || art(url, '▶ Video');
      return `<div class="fx-video ${A}" data-interactive data-video="${esc(url)}" style="background-image:url('${esc(poster)}')"><div class="fx-play"><span></span></div></div>${caption ? `<p class="fx-cap" style="margin-top:-8px;font-size:14px;color:var(--c-muted)">${esc(caption)}</p>` : ''}`;
    }
    case '@audio': return `<audio class="fx-audio" controls preload="none" data-interactive src="${esc(safeUrl(b.args[0]))}"></audio>`;
    case '@button': { const [label, url] = b.args; const goto = /^#page=(\d+)$/.exec(url || ''); return `<p class="${A}"><a class="fx-btn" data-interactive ${goto ? `href="${esc(url)}" data-goto="${goto[1]}"` : `href="${esc(safeUrl(url) || '#')}" target="_blank" rel="noopener"`}>${esc(label || 'Learn more')}</a></p>`; }
    case '@quiz': {
      const [q, ...opts] = b.args;
      const id = uid('q');
      return `<div class="fx-quiz ${A}" data-interactive data-quiz="${id}"><div class="fx-quiz-q">${inline(q)}</div>${opts.map(o => `<button type="button" data-correct="${o.startsWith('*') ? 1 : 0}">${inline(o.replace(/^\*/, ''))}</button>`).join('')}<div class="fx-quiz-fb"></div></div>`;
    }
    case '@chart': {
      const [title, data] = b.args;
      const items = String(data || '').split(',').map(s => s.split(':')).filter(x => x.length === 2).map(([l, v]) => ({ l: l.trim(), v: parseFloat(v) || 0 }));
      return `<div class="fx-chart ${A}"><div class="fx-chart-t">${esc(title)}</div>${chartSvg(items)}</div>`;
    }
    case '@stats': {
      const items = b.args.map(s => s.split(':')).map(([v, l]) => `<div class="fx-stat"><b>${esc(v)}</b><span>${esc(l || '')}</span></div>`);
      return `<div class="fx-stats ${A}">${items.join('')}</div>`;
    }
    case '@products': return `<div class="fx-products ${A}">${b.items.map(productHtml).join('')}</div>`;
    case '@product': return `<div class="fx-products ${A}">${productHtml(productFromArgs(b.args))}</div>`;
    case '@gallery': {
      const urls = b.args.join(',').split(',').map(s => s.trim()).filter(Boolean);
      return `<div class="fx-gallery ${A}" data-interactive data-gallery>${urls.map((u, i) => `<img src="${esc(img(u, 'g' + i + u))}" class="${i ? '' : 'on'}" alt="">`).join('')}<button class="fx-garrow l" type="button" aria-label="Previous">‹</button><button class="fx-garrow r" type="button" aria-label="Next">›</button><div class="fx-gnav">${urls.map((_, i) => `<button type="button" class="${i ? '' : 'on'}" aria-label="Slide ${i + 1}"></button>`).join('')}</div></div>`;
    }
    case '@menu': { const [name, price, desc] = b.args; return `<div class="${A}"><div class="fx-menu-item"><b>${esc(name)}</b><i></i><span>${esc(price || '')}</span></div>${desc ? `<div class="fx-menu-desc">${esc(desc)}</div>` : ''}</div>`; }
    case '@spacer': return `<div style="height:${parseInt(b.args[0]) || 40}px"></div>`;
    default: return '';
  }
}
function productFromArgs(a) { const [name, price, image, desc, url, sku] = a; return { name, price, image, desc, url, sku }; }
function productHtml(p) {
  const id = esc(p.sku || p.name);
  return `<div class="fx-product" data-interactive><img src="${esc(img(p.image, p.name))}" alt=""><div class="fx-pi"><h4>${esc(p.name)}</h4><p>${esc(p.desc || '')}</p><div class="fx-pp"><span class="fx-price">${esc(p.price || '')}</span><button type="button" data-cart="${id}" data-name="${esc(p.name)}" data-price="${esc(p.price || '')}" data-url="${esc(safeUrl(p.url))}">Add to cart</button></div></div></div>`;
}

/* ---------------- pagination ---------------- */
function measureHost(theme, H) {
  let host = document.getElementById('fx-measure-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'fx-measure-host';
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:800px;height:2000px;overflow:hidden;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);
  }
  host.innerHTML = `<div class="fx-page fx-measure fx-theme-${theme}" style="--fx-h:${H}px;position:relative"><div class="fx-body"></div></div>`;
  return host.querySelector('.fx-body');
}

const fits = (body) => body.scrollHeight <= body.clientHeight + 1;

/**
 * Compose a document into pages.
 * @returns {{pages: Array<{id, kind:'html', html, text}>, toc: Array<{title, page}>, meta}}
 */
export function compose(src, { theme = 'aurora', aspect = 0.7071, cover = true, toc = 'auto', back = true } = {}) {
  const { meta, blocks } = parseDoc(src);
  theme = meta.theme && THEMES.some(t => t.id === meta.theme) ? meta.theme : theme;
  const H = Math.round(800 / aspect);
  const title = meta.title || 'Untitled';
  const body = measureHost(theme, H);
  const out = [];          // content pages: { html, text, chapter? }
  const chapters = [];
  let cur = [], curText = [];
  let chapterNo = 0;
  const newPage = () => { if (cur.length) out.push({ html: cur.join(''), text: curText.join('\n') }); cur = []; curText = []; body.innerHTML = ''; };
  const tryAdd = (html) => { body.insertAdjacentHTML('beforeend', html); if (fits(body)) return true; body.lastElementChild && body.lastElementChild.remove(); return false; };
  const plain = (b) => (b.text || (b.items || []).map(x => typeof x === 'string' ? x : `${x.name} ${x.price} ${x.desc || ''}`).join(' ') || (b.args || []).join(' ') || '').replace(/[*`_\[\]]/g, '');

  // expand @product rows into grid blocks of 4 (2x2)
  const expanded = [];
  for (let k = 0; k < blocks.length; k++) {
    if (blocks[k].t === '@product') {
      const items = [];
      while (k < blocks.length && blocks[k].t === '@product') items.push(productFromArgs(blocks[k++].args));
      k--;
      const per = aspect > 1.2 ? 3 : aspect < 0.62 ? 2 : 4;
      for (let s = 0; s < items.length; s += per) expanded.push({ t: '@products', items: items.slice(s, s + per) });
    } else expanded.push(blocks[k]);
  }

  for (const b of expanded) {
    if (b.t === 'break') { newPage(); continue; }
    if (b.t === 'chapter') {
      newPage();
      chapterNo++;
      chapters.push({ title: b.text, idx: out.length });
      const h = `<div class="fx-chapter-open fx-anim"><div class="fx-chapter-num">${String(chapterNo).padStart(2, '0')}</div><div class="fx-chapter-title">${inline(b.text)}</div><div class="fx-chapter-rule"></div></div>`;
      body.insertAdjacentHTML('beforeend', h); cur.push(h); curText.push(b.text);
      continue;
    }
    const html = blockHtml(b);
    if (tryAdd(html)) { cur.push(html); curText.push(plain(b)); continue; }
    // split paragraphs word-wise
    if (b.t === 'p' || b.t === 'quote' || b.t === 'note') {
      let words = b.text.split(/\s+/);
      while (words.length) {
        let lo = 0, hi = words.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          body.insertAdjacentHTML('beforeend', blockHtml({ ...b, text: words.slice(0, mid).join(' ') }));
          const ok = fits(body); body.lastElementChild.remove();
          if (ok) lo = mid; else hi = mid - 1;
        }
        if (lo === 0) { if (!cur.length) lo = Math.min(words.length, 30); else { newPage(); continue; } }
        const part = blockHtml({ ...b, text: words.slice(0, lo).join(' ') });
        body.insertAdjacentHTML('beforeend', part); cur.push(part); curText.push(words.slice(0, lo).join(' '));
        words = words.slice(lo);
        if (words.length) newPage();
      }
      continue;
    }
    if (b.t === 'list' && b.items.length > 1) {
      let items = b.items.slice(), start = 1;
      while (items.length) {
        let n = 0;
        while (n < items.length) {
          body.insertAdjacentHTML('beforeend', blockHtml({ ...b, items: items.slice(0, n + 1), start }));
          const ok = fits(body); body.lastElementChild.remove();
          if (!ok) break; n++;
        }
        if (n === 0) { if (cur.length) { newPage(); continue; } n = 1; }
        const part = blockHtml({ ...b, items: items.slice(0, n), start });
        body.insertAdjacentHTML('beforeend', part); cur.push(part); curText.push(items.slice(0, n).join(' '));
        items = items.slice(n); start += n;
        if (items.length) newPage();
      }
      continue;
    }
    // product grids: fit as many cards as possible, continue on the next page
    if (b.t === '@products' && b.items.length > 1) {
      let items = b.items.slice();
      while (items.length) {
        let n = items.length;
        while (n > 0) { body.insertAdjacentHTML('beforeend', blockHtml({ ...b, items: items.slice(0, n) })); const ok = fits(body); body.lastElementChild.remove(); if (ok) break; n--; }
        if (n === 0) { if (cur.length) { newPage(); continue; } n = Math.min(items.length, 2); }
        const part = blockHtml({ ...b, items: items.slice(0, n) });
        body.insertAdjacentHTML('beforeend', part); cur.push(part); curText.push(items.slice(0, n).map(x => `${x.name} ${x.price} ${x.desc || ''}`).join('\n'));
        items = items.slice(n);
        if (items.length) newPage();
      }
      continue;
    }
    // atomic block: move to next page (or force onto empty page)
    if (cur.length) newPage();
    body.insertAdjacentHTML('beforeend', html); cur.push(html); curText.push(plain(b));
  }
  newPage();

  // assemble final pages
  const pages = [];
  const wantToc = toc === true || (toc === 'auto' && chapters.length >= 3);
  const offset = (cover ? 1 : 0) + (wantToc ? 1 : 0);
  const coverBg = meta.cover ? `<div class="fx-cover-art" style="background-image:url('${esc(img(meta.cover, title))}')"></div>` : '';
  const wrap = (inner, cls = '', extra = '') => `<div class="fx-page fx-theme-${theme} ${cls}" style="--fx-h:${H}px">${inner}</div>${extra}`;
  if (cover) {
    pages.push({ html: wrap(`${coverBg}${meta.kicker ? `<div class="fx-kicker">${esc(meta.kicker)}</div>` : ''}<h1 class="fx-anim">${esc(title)}</h1>${meta.subtitle ? `<p class="fx-sub fx-anim">${esc(meta.subtitle)}</p>` : ''}${meta.author ? `<div class="fx-author fx-anim">${esc(meta.author)}</div>` : ''}`, 'fx-cover'), text: [title, meta.subtitle, meta.author].filter(Boolean).join('\n'), role: 'cover' });
  }
  const tocEntries = chapters.map((c, k) => ({ title: c.title, page: c.idx + offset, n: k + 1 }));
  if (wantToc) {
    pages.push({ html: wrap(`<div class="fx-body fx-toc"><h2 class="fx-anim">Contents</h2>${tocEntries.map(e => `<a href="#page=${e.page}" data-goto="${e.page}" data-interactive class="fx-anim"><i>${String(e.n).padStart(2, '0')}</i><span>${inline(e.title)}</span><b>${e.page + 1}</b></a>`).join('')}</div>`), text: 'Contents\n' + tocEntries.map(e => e.title).join('\n'), role: 'toc' });
  }
  let currentChapter = '';
  out.forEach((p, k) => {
    const ch = chapters.filter(c => c.idx <= k).pop(); if (ch) currentChapter = ch.title;
    const n = pages.length + 1;
    pages.push({ html: wrap(`<div class="fx-body">${p.html}</div><div class="fx-folio"><span>${esc(currentChapter || title)}</span><b>${n}</b></div>`), text: p.text });
  });
  if (back) {
    const cta = meta.cta ? meta.cta.split('|').map(s => s.trim()) : null;
    pages.push({ html: wrap(`<h2 class="fx-anim">${esc(meta.backtitle || 'Thanks for reading')}</h2><p class="fx-anim">${esc(meta.backtext || meta.subtitle || '')}</p>${cta ? `<a class="fx-btn fx-anim" data-interactive href="${esc(safeUrl(cta[1]) || '#')}" target="_blank" rel="noopener">${esc(cta[0])}</a>` : ''}`, 'fx-back'), text: meta.backtitle || 'Thanks for reading', role: 'back' });
  }
  if (pages.length % 2 === 1 && pages.length > 2 && back) {
    // keep back cover on its own (even) side by inserting a notes page before it
    pages.splice(pages.length - 1, 0, { html: wrap(`<div class="fx-body"><h3 style="color:var(--c-muted)">Notes</h3></div>`), text: 'Notes', role: 'blank' });
  }
  return {
    pages: pages.map(p => ({ id: uid('pg_'), kind: 'html', html: p.html, text: p.text, role: p.role })),
    toc: tocEntries.map(e => ({ title: e.title, page: e.page })),
    meta, theme,
  };
}

/** CSV (name,price,image,description,url,sku) -> product markdown. */
export function csvToProducts(csv) {
  const rows = parseCsv(csv);
  if (!rows.length) return '';
  const head = rows[0].map(h => h.toLowerCase().trim());
  const col = (names) => head.findIndex(h => names.includes(h));
  const ix = { name: col(['name', 'title', 'product']), price: col(['price', 'cost']), image: col(['image', 'img', 'photo', 'image_url']), desc: col(['description', 'desc', 'details']), url: col(['url', 'link']), sku: col(['sku', 'id', 'code']), cat: col(['category', 'section', 'collection']) };
  const hasHead = ix.name >= 0;
  const data = hasHead ? rows.slice(1) : rows;
  const get = (r, k, d) => (ix[k] >= 0 ? r[ix[k]] : r[d]) || '';
  let md = '', lastCat = null;
  for (const r of data) {
    if (!r.join('').trim()) continue;
    const cat = ix.cat >= 0 ? r[ix.cat] : null;
    if (cat && cat !== lastCat) { md += `\n# ${cat}\n\n`; lastCat = cat; }
    md += `@product ${[get(r, 'name', 0), get(r, 'price', 1), get(r, 'image', 2), get(r, 'desc', 3), get(r, 'url', 4), get(r, 'sku', 5)].map(s => String(s).replace(/\|/g, '/')).join(' | ')}\n`;
  }
  return md;
}
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
