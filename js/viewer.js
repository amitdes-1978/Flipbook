// FlipForge viewer runtime: mounts a full reading experience for a book.
// Used by viewer.html (live), the studio (preview) and exported standalone HTML files.
import { Flipbook, makeFlipSound } from './flipbook.js';
import { esc, safeUrl, videoEmbed, sha256, store, icon, fmtTime } from './util.js';

const isMobile = () => matchMedia('(max-width: 720px)').matches;

/** Strip scripts / inline handlers from stored page HTML before injecting it. */
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('script,object,embed,base,meta,link[rel=import]').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

function parsePrice(p) { const n = parseFloat(String(p || '').replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
function currencyOf(p) { const m = String(p || '').match(/^[^\d\s.,-]+|[^\d\s.,-]+$/); return m ? m[0] : ''; }

export async function mountViewer(root, book, opts = {}) {
  const S = book.settings;
  const T = S.tools || {};
  const mode = opts.mode || 'live';
  const assetUrl = opts.assetUrl || (async () => null);
  const urlCache = new Map();
  const getUrl = async (key) => { if (!key) return null; if (/^(https?:|data:|blob:)/.test(key)) return key; if (!urlCache.has(key)) urlCache.set(key, assetUrl(key)); return urlCache.get(key); };
  const session = { id: Math.random().toString(36).slice(2, 10), start: Date.now(), pages: new Set(), clicks: 0 };
  const emit = (type, data = {}) => {
    const ev = { book: book.id, session: session.id, type, ...data };
    try { opts.onEvent && opts.onEvent(ev); } catch { /* ignore */ }
    if (window.gtag && mode !== 'preview') try { window.gtag('event', 'flipbook_' + type, { book_title: book.title, ...data }); } catch { /* ignore */ }
  };
  const hook = (payload) => {
    const url = S.integrations?.webhook;
    if (!url || mode === 'preview' || !/^https:/.test(url)) return;
    try { fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ book: book.title, bookId: book.id, ...payload }), keepalive: true }); } catch { /* ignore */ }
  };
  if (S.integrations?.ga4 && mode !== 'preview' && /^G-[A-Z0-9]+$/.test(S.integrations.ga4) && !window.gtag) {
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + S.integrations.ga4; document.head.appendChild(s);
    window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', S.integrations.ga4);
  }

  const hasProducts = book.pages.some(p => p.html && p.html.includes('data-cart')) || (book.hotspots || []).some(h => h.type === 'product');
  const btn = (name, label, extra = '') => `<button class="fv-btn" data-act="${name}" title="${label}" aria-label="${label}" ${extra}>${icon(name === 'autoplay' ? 'play' : name === 'tts' ? 'speak' : name === 'night' ? 'moon' : name === 'thumbs' ? 'grid' : name === 'toc' ? 'list' : name === 'fullscreen' ? 'full' : name)}</button>`;
  root.innerHTML = `
  <div class="fv fv-skin-${S.skin || 'dark'} ${opts.embed ? 'fv-embed' : ''}" style="--ff-accent:${esc(S.accent)};--fv-accent:${esc(S.accent)}">
    <div class="fv-bg"></div>
    <header class="fv-top">
      <div class="fv-brand">${S.logoBlob ? `<a class="fv-logo" ${S.logoLink ? `href="${esc(safeUrl(S.logoLink))}" target="_blank" rel="noopener"` : ''}><img alt="logo" data-blob="${esc(S.logoBlob)}"></a>` : ''}<div class="fv-title">${esc(book.title)}</div></div>
      <div class="fv-top-actions">
        ${S.cta?.enabled && S.cta.url ? `<a class="fv-cta" href="${esc(safeUrl(S.cta.url))}" target="_blank" rel="noopener" data-act="cta">${esc(S.cta.label || 'Learn more')}</a>` : ''}
        ${hasProducts ? `<button class="fv-btn fv-cart-btn" data-act="cart" aria-label="Cart">${icon('cart')}<span class="fv-badge" hidden>0</span></button>` : ''}
        ${T.search !== false ? btn('search', 'Search') : ''}
        ${T.share !== false ? btn('share', 'Share') : ''}
        ${T.download && book.sourcePdf ? btn('download', 'Download PDF') : ''}
        ${T.print ? btn('print', 'Print') : ''}
        ${T.fullscreen !== false ? btn('fullscreen', 'Full screen') : ''}
      </div>
    </header>
    <main class="fv-main">
      <div class="fv-book"></div>
      <button class="fv-nav fv-prev" data-act="prev" aria-label="Previous page">${icon('prev', 30)}</button>
      <button class="fv-nav fv-next" data-act="next" aria-label="Next page">${icon('next', 30)}</button>
    </main>
    <footer class="fv-bottom">
      <div class="fv-group">
        ${T.thumbnails !== false ? btn('thumbs', 'Thumbnails') : ''}
        ${T.toc !== false && (S.toc || []).length ? btn('toc', 'Contents') : ''}
        ${T.bookmarks !== false ? btn('bookmark', 'Bookmarks & notes') : ''}
      </div>
      <div class="fv-pager">
        <button class="fv-btn" data-act="first" aria-label="First page">${icon('first')}</button>
        <input class="fv-range" type="range" min="1" max="${book.pages.length}" value="1" aria-label="Page">
        <button class="fv-pageno" data-act="jump" aria-label="Go to page"><span class="fv-cur">1</span> / ${book.pages.length}</button>
        <button class="fv-btn" data-act="last" aria-label="Last page">${icon('last')}</button>
      </div>
      <div class="fv-group">
        ${T.zoom !== false ? btn('zoomout', 'Zoom out') + btn('zoomin', 'Zoom in') : ''}
        ${T.autoplay !== false ? btn('autoplay', 'Auto-flip slideshow') : ''}
        ${T.tts !== false && 'speechSynthesis' in window ? btn('tts', 'Read aloud') : ''}
        ${S.music?.src || S.music?.blob ? btn('music', 'Background music') : ''}
        ${T.sound !== false ? btn('sound', 'Flip sound') : ''}
        ${T.night !== false ? btn('night', 'Night reading') : ''}
      </div>
    </footer>
    <aside class="fv-drawer" aria-hidden="true"><div class="fv-drawer-head"><div class="fv-tabs"></div><button class="fv-btn" data-act="closedrawer" aria-label="Close">${icon('close')}</button></div><div class="fv-drawer-body"></div></aside>
    <div class="fv-modal" hidden role="dialog" aria-modal="true"><div class="fv-modal-card"><button class="fv-btn fv-modal-x" data-act="closemodal" aria-label="Close">${icon('close')}</button><div class="fv-modal-body"></div></div></div>
    <div class="fv-toast" role="status"></div>
    <div class="fv-live sr-only" aria-live="polite"></div>
    ${S.backlink !== false ? `<a class="fv-made" href="index.html" target="_blank" rel="noopener">Made with FlipForge</a>` : ''}
  </div>`;
  const $ = (s) => root.querySelector(s);
  const V = $('.fv');
  const bg = $('.fv-bg');
  if (S.background?.kind === 'image' && S.bgBlob) getUrl(S.bgBlob).then(u => { if (u) bg.style.background = `center/cover no-repeat url("${u}")`; });
  else bg.style.background = S.background?.value || '';
  if (S.background?.blur) bg.style.filter = 'blur(12px) brightness(.7)';
  root.querySelectorAll('img[data-blob]').forEach(async im => { im.src = await getUrl(im.dataset.blob) || ''; });

  const toast = (msg) => { const t = $('.fv-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200); };

  /* ---------- page rendering ---------- */
  const hsByPage = new Map();
  for (const h of book.hotspots || []) { if (!hsByPage.has(h.page)) hsByPage.set(h.page, []); hsByPage.get(h.page).push(h); }

  function renderPage(i) {
    const p = book.pages[i];
    const el = document.createElement('div');
    el.className = 'fv-pg';
    if (p.kind === 'image') {
      const im = new Image();
      im.alt = `Page ${i + 1}`; im.decoding = 'async'; im.draggable = false;
      if (p.fit === 'cover') im.style.objectFit = 'cover';
      getUrl(p.image).then(u => { if (u) im.src = u; });
      el.appendChild(im);
      if (p.text) { const sr = document.createElement('div'); sr.className = 'sr-only'; sr.textContent = p.text; el.appendChild(sr); }
    } else {
      const h = document.createElement('div');
      h.className = 'ff-html';
      h.innerHTML = sanitize(p.html || '');
      el.appendChild(h);
      wireHtml(h, i);
    }
    const hs = hsByPage.get(i);
    if (hs && hs.length) el.appendChild(renderHotspots(hs, i));
    return el;
  }

  function renderHotspots(list, page) {
    const layer = document.createElement('div');
    layer.className = 'ff-hotspots';
    for (const h of list) {
      const st = h.style || {};
      const pos = `left:${h.x * 100}%;top:${h.y * 100}%;width:${h.w * 100}%;height:${h.h * 100}%`;
      const anim = st.anim && st.anim !== 'none' ? ` fv-anim fv-anim-${st.anim}` : '';
      let el;
      if (h.type === 'text') {
        el = document.createElement('div');
        el.className = 'fv-ov fv-ov-text' + anim;
        el.style.cssText = `${pos};color:${st.color || '#111'};background:${st.bg || 'transparent'};font-family:${st.font || 'inherit'};font-weight:${st.weight || 600};text-align:${st.align || 'left'};font-size:calc(${st.size || 24}px * var(--ff-scale));border-radius:${st.radius ?? 6}px`;
        el.textContent = h.data?.text || '';
      } else if (h.type === 'shape') {
        el = document.createElement('div');
        el.className = 'fv-ov' + anim;
        el.style.cssText = `${pos};background:${st.fill || 'rgba(109,94,252,.3)'};border-radius:${st.shape === 'ellipse' ? '50%' : (st.radius ?? 8) + 'px'};opacity:${st.opacity ?? 1};border:${st.border ? `3px solid ${st.border}` : '0'}`;
      } else if (h.type === 'sticker') {
        el = document.createElement('img');
        el.className = 'fv-ov fv-ov-img' + anim; el.alt = '';
        el.style.cssText = pos;
        getUrl(h.data?.blob || h.data?.src).then(u => { if (u) el.src = u; });
      } else if (h.type === 'video' && h.data?.mode === 'inline') {
        el = document.createElement('div');
        el.className = 'ff-hs-inline' + anim; el.style.cssText = pos; el.dataset.interactive = '';
        const e = videoEmbed(h.data.url, false);
        if (h.data.blob) getUrl(h.data.blob).then(u => { el.innerHTML = `<video src="${esc(u)}" controls playsinline ${h.data.autoplay ? 'autoplay muted loop' : ''}></video>`; });
        else el.innerHTML = e.kind === 'iframe' ? `<iframe src="${esc(e.src.replace('autoplay=1', 'autoplay=0'))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>` : `<video src="${esc(e.src)}" controls playsinline></video>`;
      } else {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'ff-hotspot' + (st.pulse ? ' ff-hs-pulse' : '') + anim;
        el.style.cssText = pos;
        el.setAttribute('aria-label', h.data?.label || h.data?.title || h.type);
        if (st.icon !== false && !h.auto) el.innerHTML = `<span class="ff-hs-badge">${icon({ page: 'page', link: 'link', video: 'play', audio: 'audio', image: 'image', gallery: 'gallery', note: 'note', quiz: 'quiz', embed: 'embed', product: 'cart' }[h.type] || 'link', 13)}</span>`;
        el.addEventListener('click', (e) => { e.stopPropagation(); activate(h, el); });
      }
      layer.appendChild(el);
    }
    if (S.highlightLinks === false) layer.classList.add('fv-nohl');
    return layer;
  }

  function wireHtml(h, page) {
    h.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) { e.preventDefault(); e.stopPropagation(); go(parseInt(g.dataset.goto, 10)); return; }
      const v = e.target.closest('[data-video]');
      if (v && !v.querySelector('iframe,video')) {
        e.stopPropagation();
        const em = videoEmbed(v.dataset.video, true);
        v.innerHTML = em.kind === 'iframe' ? `<iframe src="${esc(em.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>` : `<video src="${esc(em.src)}" controls autoplay playsinline></video>`;
        emit('click', { kind: 'video', page }); return;
      }
      const qb = e.target.closest('.fx-quiz button');
      if (qb) {
        e.stopPropagation();
        const q = qb.closest('.fx-quiz'); if (q.dataset.done) return;
        q.dataset.done = 1;
        const ok = qb.dataset.correct === '1';
        q.querySelectorAll('button').forEach(b => { if (b.dataset.correct === '1') b.classList.add('ok'); });
        if (!ok) qb.classList.add('bad');
        q.querySelector('.fx-quiz-fb').textContent = ok ? '✅ Correct — well done!' : '❌ Not quite. The right answer is highlighted.';
        emit('quiz', { page, correct: ok }); return;
      }
      const c = e.target.closest('[data-cart]');
      if (c) { e.stopPropagation(); addToCart({ sku: c.dataset.cart, name: c.dataset.name, price: c.dataset.price, url: c.dataset.url }); return; }
      const gal = e.target.closest('[data-gallery]');
      if (gal) {
        e.stopPropagation();
        const imgs = [...gal.querySelectorAll('img')], dots = [...gal.querySelectorAll('.fx-gnav button')];
        let k = imgs.findIndex(x => x.classList.contains('on'));
        if (e.target.closest('.fx-garrow.l')) k = (k - 1 + imgs.length) % imgs.length;
        else if (e.target.closest('.fx-garrow.r')) k = (k + 1) % imgs.length;
        else if (e.target.closest('.fx-gnav button')) k = dots.indexOf(e.target.closest('.fx-gnav button'));
        else { openGallery(imgs.map(x => x.src), k); return; }
        imgs.forEach((x, j) => x.classList.toggle('on', j === k)); dots.forEach((x, j) => x.classList.toggle('on', j === k));
        return;
      }
      const a = e.target.closest('a[href]');
      if (a) { e.stopPropagation(); emit('click', { kind: 'link', page, url: a.href }); }
    });
  }

  /* ---------- hotspot actions ---------- */
  const audios = new Map();
  async function activate(h, el) {
    session.clicks++;
    emit('click', { hotspot: h.id, kind: h.type, page: h.page });
    const d = h.data || {};
    switch (h.type) {
      case 'link': { const u = safeUrl(d.url); if (u) window.open(u, d.newTab === false ? '_self' : '_blank', 'noopener'); break; }
      case 'page': go(d.page | 0); break;
      case 'video': {
        if (d.blob) { const u = await getUrl(d.blob); modal(`<div class="fv-media"><video src="${esc(u)}" controls autoplay playsinline></video></div>`, 'wide'); break; }
        const e = videoEmbed(d.url, true);
        modal(`<div class="fv-media">${e.kind === 'iframe' ? `<iframe src="${esc(e.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>` : `<video src="${esc(e.src)}" controls autoplay playsinline></video>`}</div>`, 'wide');
        break;
      }
      case 'audio': {
        let a = audios.get(h.id);
        if (!a) { a = new Audio(await getUrl(d.blob || d.url)); audios.set(h.id, a); a.onended = () => el.classList.remove('fv-playing'); }
        if (a.paused) { audios.forEach(x => x.pause()); a.play(); el.classList.add('fv-playing'); toast('▶ Playing audio'); } else { a.pause(); el.classList.remove('fv-playing'); }
        break;
      }
      case 'image': openGallery([await getUrl(d.blob || d.src)], 0, d.caption); break;
      case 'gallery': openGallery(await Promise.all((d.images || []).map(getUrl)), 0); break;
      case 'note': modal(`<div class="fv-note-pop">${d.title ? `<h3>${esc(d.title)}</h3>` : ''}<p>${esc(d.text || '').replace(/\n/g, '<br>')}</p></div>`, 'small'); break;
      case 'embed': { const u = safeUrl(d.url); if (u) modal(`<div class="fv-media fv-embed-frame"><iframe src="${esc(u)}" allowfullscreen></iframe></div>`, 'wide'); break; }
      case 'quiz': {
        modal(`<div class="fv-quiz"><h3>${esc(d.question)}</h3>${(d.options || []).map((o, k) => `<button class="fv-opt" data-k="${k}">${esc(o)}</button>`).join('')}<p class="fv-quiz-fb"></p></div>`, 'small');
        $('.fv-quiz').addEventListener('click', (e) => {
          const b = e.target.closest('.fv-opt'); if (!b || b.parentNode.dataset.done) return;
          b.parentNode.dataset.done = 1; const ok = +b.dataset.k === (d.correct | 0);
          b.parentNode.querySelectorAll('.fv-opt')[d.correct | 0].classList.add('ok'); if (!ok) b.classList.add('bad');
          $('.fv-quiz-fb').textContent = ok ? '✅ Correct!' : '❌ Not quite.'; emit('quiz', { page: h.page, correct: ok, hotspot: h.id });
        });
        break;
      }
      case 'product': {
        const im = await getUrl(d.blob || d.image);
        modal(`<div class="fv-product">${im ? `<img src="${esc(im)}" alt="">` : ''}<div><h3>${esc(d.name)}</h3><div class="fv-price">${esc(d.price || '')}</div><p>${esc(d.desc || '')}</p><div class="fv-row"><button class="fv-primary" data-add>Add to cart</button>${safeUrl(d.url) ? `<a class="fv-secondary" href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener">View details</a>` : ''}</div></div></div>`);
        root.querySelector('[data-add]').onclick = () => { addToCart({ sku: d.sku || d.name, name: d.name, price: d.price, url: d.url }); closeModal(); };
        break;
      }
    }
  }

  function openGallery(urls, k = 0, caption = '') {
    urls = urls.filter(Boolean); if (!urls.length) return;
    modal(`<div class="fv-lightbox"><img src="${esc(urls[k])}" alt="">${urls.length > 1 ? `<button class="fv-lb l" aria-label="Previous">${icon('prev', 28)}</button><button class="fv-lb r" aria-label="Next">${icon('next', 28)}</button><div class="fv-lb-count">${k + 1} / ${urls.length}</div>` : ''}${caption ? `<p>${esc(caption)}</p>` : ''}</div>`, 'wide');
    const lb = root.querySelector('.fv-lightbox');
    lb.addEventListener('click', (e) => {
      const d = e.target.closest('.fv-lb'); if (!d) return;
      k = (k + (d.classList.contains('r') ? 1 : -1) + urls.length) % urls.length;
      lb.querySelector('img').src = urls[k]; lb.querySelector('.fv-lb-count').textContent = `${k + 1} / ${urls.length}`;
    });
  }

  /* ---------- modal & drawer ---------- */
  let modalLocked = false;
  function modal(html, size = '', locked = false) {
    const m = $('.fv-modal');
    m.querySelector('.fv-modal-body').innerHTML = html;
    m.className = 'fv-modal ' + (size ? 'fv-modal-' + size : '');
    m.hidden = false; modalLocked = locked;
    m.querySelector('.fv-modal-x').hidden = locked;
    stopAuto();
    setTimeout(() => (m.querySelector('input,button:not(.fv-modal-x)') || m.querySelector('.fv-modal-x')).focus(), 30);
  }
  function closeModal() {
    if (modalLocked) return;
    const m = $('.fv-modal'); m.hidden = true; m.querySelector('.fv-modal-body').innerHTML = '';
  }
  $('.fv-modal').addEventListener('click', (e) => { if (e.target.classList.contains('fv-modal')) closeModal(); });

  let drawerTab = null;
  function openDrawer(tab) {
    const d = $('.fv-drawer');
    if (drawerTab === tab && d.classList.contains('on')) { closeDrawer(); return; }
    drawerTab = tab; d.classList.add('on'); d.setAttribute('aria-hidden', 'false'); V.classList.add('fv-drawer-open');
    const tabs = [['thumbs', 'Pages'], ...((S.toc || []).length && T.toc !== false ? [['toc', 'Contents']] : []), ...(T.search !== false ? [['search', 'Search']] : []), ...(T.bookmarks !== false ? [['bookmark', 'Saved']] : [])];
    d.querySelector('.fv-tabs').innerHTML = tabs.map(([k, l]) => `<button class="fv-tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
    const body = d.querySelector('.fv-drawer-body');
    if (tab === 'thumbs') renderThumbs(body);
    else if (tab === 'toc') body.innerHTML = `<nav class="fv-toc">${S.toc.map(t => `<button data-goto="${t.page}" style="padding-left:${12 + (t.depth || 0) * 16}px"><span>${esc(t.title)}</span><b>${t.page + 1}</b></button>`).join('')}</nav>`;
    else if (tab === 'search') { body.innerHTML = `<div class="fv-search"><input type="search" placeholder="Search this publication…" aria-label="Search"><div class="fv-results"></div></div>`; const inp = body.querySelector('input'); inp.focus(); inp.addEventListener('input', () => doSearch(inp.value, body.querySelector('.fv-results'))); }
    else if (tab === 'bookmark') renderBookmarks(body);
  }
  function closeDrawer() { const d = $('.fv-drawer'); d.classList.remove('on'); d.setAttribute('aria-hidden', 'true'); V.classList.remove('fv-drawer-open'); drawerTab = null; }
  $('.fv-drawer').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (t) { drawerTab = null; openDrawer(t.dataset.tab); return; }
    const g = e.target.closest('[data-goto]'); if (g) { go(+g.dataset.goto, g.dataset.q); if (isMobile()) closeDrawer(); }
  });

  function renderThumbs(body) {
    body.innerHTML = `<div class="fv-thumbs">${book.pages.map((p, i) => `<button class="fv-thumb" data-goto="${i}" aria-label="Page ${i + 1}"><div class="fv-thumb-img" data-i="${i}"></div><span>${i + 1}</span></button>`).join('')}</div>`;
    const io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        const box = en.target; io.unobserve(box);
        const i = +box.dataset.i, p = book.pages[i];
        box.style.aspectRatio = String(book.aspect);
        if (p.kind === 'image') getUrl(p.thumb || p.image).then(u => { box.style.backgroundImage = `url("${u}")`; });
        else { const w = box.clientWidth || 110; box.innerHTML = `<div class="ff-html fx-static" style="transform:scale(${w / 800})">${sanitize(p.html)}</div>`; }
      }
    }, { root: body });
    body.querySelectorAll('.fv-thumb-img').forEach(b => io.observe(b));
    markThumbs();
  }
  function markThumbs() { const vis = new Set(fb.visible()); root.querySelectorAll('.fv-thumb').forEach(t => t.classList.toggle('on', vis.has(+t.dataset.goto))); }

  function doSearch(q, out) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { out.innerHTML = ''; return; }
    const res = [];
    book.pages.forEach((p, i) => {
      const t = (p.text || '').replace(/\s+/g, ' '); const low = t.toLowerCase();
      let k = low.indexOf(q), n = 0;
      while (k >= 0 && n < 3) { res.push({ i, snip: esc(t.slice(Math.max(0, k - 40), k)) + '<mark>' + esc(t.substr(k, q.length)) + '</mark>' + esc(t.slice(k + q.length, k + q.length + 50)) }); k = low.indexOf(q, k + q.length); n++; }
    });
    out.innerHTML = res.length ? `<p class="fv-muted">${res.length} result${res.length > 1 ? 's' : ''}</p>` + res.slice(0, 80).map(r => `<button class="fv-hit" data-goto="${r.i}" data-q="${esc(q)}"><b>Page ${r.i + 1}</b><span>…${r.snip}…</span></button>`).join('') : '<p class="fv-muted">No matches.</p>';
    emit('search', { q });
  }
  function highlight(i, q) {
    const node = fb.cache.get(i); if (!node || !q) return;
    node.querySelectorAll('.ff-search-hit').forEach(x => x.remove());
    node.querySelectorAll('mark.fv-mark').forEach(m => m.replaceWith(m.textContent));
    const p = book.pages[i];
    if (p.kind === 'image' && p.words) {
      for (const w of p.words) if (w.s.toLowerCase().includes(q)) {
        const hit = document.createElement('div'); hit.className = 'ff-search-hit';
        hit.style.cssText = `left:${w.x * 100}%;top:${w.y * 100}%;width:${w.w * 100}%;height:${w.h * 100}%`;
        node.querySelector('.fv-pg').appendChild(hit);
      }
    } else {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); const hits = [];
      while (walker.nextNode()) { const n = walker.currentNode; if (n.nodeValue.toLowerCase().includes(q)) hits.push(n); }
      for (const n of hits) {
        const low = n.nodeValue.toLowerCase(), k = low.indexOf(q);
        const r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + q.length);
        const m = document.createElement('mark'); m.className = 'fv-mark'; r.surroundContents(m);
      }
    }
  }

  /* ---------- bookmarks & notes ---------- */
  const BMK = 'ffbm_' + book.id;
  function renderBookmarks(body) {
    const bm = store.get(BMK, { pages: [], notes: {} });
    const cur = fb.visible()[0];
    body.innerHTML = `<div class="fv-bm">
      <button class="fv-primary fv-full" data-bm-add>${icon('bookmark', 16)} ${bm.pages.includes(cur) ? 'Remove bookmark' : 'Bookmark page ' + (cur + 1)}</button>
      ${T.notes !== false ? `<label class="fv-label">Note for page ${cur + 1}<textarea rows="4" data-note placeholder="Write a private note…">${esc(bm.notes[cur] || '')}</textarea></label>` : ''}
      <h4>Bookmarks</h4>${bm.pages.length ? bm.pages.sort((a, b) => a - b).map(p => `<button class="fv-hit" data-goto="${p}"><b>Page ${p + 1}</b><span>${esc((book.pages[p].text || '').slice(0, 70))}</span></button>`).join('') : '<p class="fv-muted">No bookmarks yet.</p>'}
      <h4>Notes</h4>${Object.keys(bm.notes).filter(k => bm.notes[k]).map(k => `<button class="fv-hit" data-goto="${k}"><b>Page ${+k + 1}</b><span>${esc(bm.notes[k])}</span></button>`).join('') || '<p class="fv-muted">No notes yet.</p>'}
      <p class="fv-muted">Saved privately in this browser.</p></div>`;
    body.querySelector('[data-bm-add]').onclick = () => { const b = store.get(BMK, { pages: [], notes: {} }); const k = b.pages.indexOf(cur); if (k >= 0) b.pages.splice(k, 1); else b.pages.push(cur); store.set(BMK, b); renderBookmarks(body); toast(k >= 0 ? 'Bookmark removed' : 'Page bookmarked'); };
    const ta = body.querySelector('[data-note]');
    if (ta) ta.addEventListener('change', () => { const b = store.get(BMK, { pages: [], notes: {} }); b.notes[cur] = ta.value; store.set(BMK, b); toast('Note saved'); });
  }

  /* ---------- cart ---------- */
  const CK = 'ffcart_' + book.id;
  const cart = () => store.get(CK, []);
  function addToCart(item) {
    const c = cart(); const ex = c.find(x => x.sku === item.sku);
    if (ex) ex.qty++; else c.push({ ...item, qty: 1 });
    store.set(CK, c); updateCartBadge(); toast(`Added “${item.name}” to cart`);
    emit('cart', { sku: item.sku, name: item.name });
  }
  function updateCartBadge() { const b = root.querySelector('.fv-badge'); if (!b) return; const n = cart().reduce((s, x) => s + x.qty, 0); b.textContent = n; b.hidden = !n; }
  function openCart() {
    const c = cart(); const cur = currencyOf(c[0]?.price) || S.shop?.currency || '';
    const total = c.reduce((s, x) => s + parsePrice(x.price) * x.qty, 0);
    modal(`<div class="fv-cart"><h3>${icon('cart')} Your order</h3>${c.length ? `<div class="fv-cart-list">${c.map((x, k) => `<div class="fv-cart-row"><span>${esc(x.name)}</span><div class="fv-qty"><button data-q="${k}" data-d="-1">−</button><b>${x.qty}</b><button data-q="${k}" data-d="1">+</button></div><span>${esc(x.price)}</span></div>`).join('')}</div>
      <div class="fv-cart-total">Total <b>${esc(cur)}${total.toFixed(2)}</b></div>
      <label class="fv-label">Your name<input data-cname></label><label class="fv-label">Contact (email or phone)<input data-ccontact></label>
      <div class="fv-row">${S.shop?.email ? `<button class="fv-primary" data-send="email">Send order by email</button>` : ''}${S.shop?.whatsapp ? `<button class="fv-primary fv-wa" data-send="wa">Order via WhatsApp</button>` : ''}<button class="fv-secondary" data-send="copy">Copy order</button></div>` : '<p class="fv-muted">Your cart is empty. Tap “Add to cart” on any product.</p>'}</div>`);
    const card = root.querySelector('.fv-cart');
    card.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) { const cc = cart(); cc[+q.dataset.q].qty += +q.dataset.d; store.set(CK, cc.filter(x => x.qty > 0)); updateCartBadge(); openCart(); return; }
      const s = e.target.closest('[data-send]'); if (!s) return;
      const name = card.querySelector('[data-cname]').value, contact = card.querySelector('[data-ccontact]').value;
      const text = `Order from “${book.title}”\n\n${c.map(x => `${x.qty} × ${x.name} (${x.price})${x.sku && x.sku !== x.name ? ' [' + x.sku + ']' : ''}`).join('\n')}\n\nTotal: ${cur}${total.toFixed(2)}\nName: ${name}\nContact: ${contact}`;
      emit('order', { total, items: c.length }); hook({ type: 'order', text, name, contact, items: c, total });
      if (s.dataset.send === 'email') location.href = `mailto:${S.shop.email}?subject=${encodeURIComponent('New order: ' + book.title)}&body=${encodeURIComponent(text)}`;
      else if (s.dataset.send === 'wa') window.open(`https://wa.me/${String(S.shop.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      else navigator.clipboard?.writeText(text).then(() => toast('Order copied'));
    });
  }

  /* ---------- share ---------- */
  function shareLink(page) {
    const base = opts.shareUrl || location.href.split('#')[0];
    return page ? `${base}#page=${page + 1}` : base;
  }
  function openShare() {
    const cur = fb.visible()[0];
    const url = shareLink(0), urlP = shareLink(cur);
    const embed = `<iframe src="${url}${url.includes('?') ? '&' : '?'}embed=1" width="100%" height="560" style="border:0;border-radius:12px" allowfullscreen title="${esc(book.title)}"></iframe>`;
    const enc = encodeURIComponent, t = enc(book.title);
    modal(`<div class="fv-share"><h3>Share “${esc(book.title)}”</h3>
      <div class="fv-socials">
        <a target="_blank" rel="noopener" href="https://wa.me/?text=${t}%20${enc(url)}">WhatsApp</a>
        <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${enc(url)}">Facebook</a>
        <a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${t}&url=${enc(url)}">X</a>
        <a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}">LinkedIn</a>
        <a target="_blank" rel="noopener" href="https://pinterest.com/pin/create/button/?url=${enc(url)}&description=${t}">Pinterest</a>
        <a href="mailto:?subject=${t}&body=${enc(url)}">Email</a>
      </div>
      <label class="fv-label">Link<div class="fv-copy"><input readonly value="${esc(url)}"><button data-copy="${esc(url)}">Copy</button></div></label>
      <label class="fv-label">Link to this page (${cur + 1})<div class="fv-copy"><input readonly value="${esc(urlP)}"><button data-copy="${esc(urlP)}">Copy</button></div></label>
      <label class="fv-label">Embed code<div class="fv-copy"><input readonly value="${esc(embed)}"><button data-copy="${esc(embed)}">Copy</button></div></label>
      ${opts.qr ? `<div class="fv-qr">${opts.qr(url)}<span>Scan to open on a phone</span></div>` : ''}
      ${navigator.share ? `<button class="fv-primary fv-full" data-native>More sharing options…</button>` : ''}
      ${mode === 'preview' ? '<p class="fv-muted">Preview mode: publish or export to get a public link.</p>' : ''}</div>`);
    const sh = root.querySelector('.fv-share');
    sh.addEventListener('click', (e) => {
      const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast('Copied to clipboard')); emit('share', { via: 'copy' }); }
      if (e.target.closest('[data-native]')) navigator.share({ title: book.title, url }).catch(() => {});
      if (e.target.closest('.fv-socials a')) emit('share', { via: e.target.textContent });
    });
  }

  /* ---------- gates: password & lead form ---------- */
  async function passwordGate() {
    if (!S.password?.enabled || !S.password.hash || opts.skipGates) return;
    const ok = store.get('ffpw_' + book.id) === S.password.hash;
    if (ok) return;
    await new Promise((res) => {
      modal(`<form class="fv-gate"><div class="fv-gate-ico">${icon('lock', 34)}</div><h3>This publication is protected</h3><p>Enter the password to continue.</p><input type="password" required autocomplete="current-password" placeholder="Password"><p class="fv-err"></p><button class="fv-primary fv-full">Unlock</button></form>`, 'small', true);
      const f = root.querySelector('.fv-gate');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const h = await sha256(book.id + ':' + f.querySelector('input').value);
        if (h === S.password.hash) { store.set('ffpw_' + book.id, h); modalLocked = false; closeModal(); res(); }
        else f.querySelector('.fv-err').textContent = 'Incorrect password, try again.';
      };
    });
  }
  const LK = 'fflead_' + book.id;
  let leadOpen = false;
  function leadGate(visible) {
    const L = S.lead;
    if (!L?.enabled || opts.skipGates || leadOpen || store.get(LK)) return false;
    if (Math.max(...visible) < (L.page | 0)) return false;
    leadOpen = true;
    const fields = { name: ['Full name', 'text', 'name'], email: ['Email', 'email', 'email'], phone: ['Phone', 'tel', 'tel'], company: ['Company', 'text', 'organization'], role: ['Job title', 'text', 'organization-title'], message: ['Message', 'textarea', 'off'] };
    modal(`<form class="fv-gate fv-lead"><h3>${esc(L.title)}</h3><p>${esc(L.text)}</p>${(L.fields || ['email']).map(f => { const [lab, type, ac] = fields[f] || [f, 'text', 'off']; return `<label class="fv-label">${lab}${type === 'textarea' ? `<textarea name="${f}" rows="3"></textarea>` : `<input name="${f}" type="${type}" autocomplete="${ac}" ${f === 'email' || f === 'name' ? 'required' : ''}>`}</label>`; }).join('')}
      ${L.consent ? `<label class="fv-check"><input type="checkbox" required> <span>${esc(L.consent)}</span></label>` : ''}
      <button class="fv-primary fv-full">Continue reading</button>${L.skippable ? '<button type="button" class="fv-link" data-skip>Skip for now</button>' : ''}</form>`, 'small', true);
    const f = root.querySelector('.fv-lead');
    f.onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      store.set(LK, 1); leadOpen = false; modalLocked = false; closeModal();
      emit('lead', { page: Math.max(...visible) }); opts.onLead && opts.onLead({ book: book.id, ...data, page: Math.max(...visible) });
      hook({ type: 'lead', ...data }); toast('Thanks! Enjoy the rest.');
    };
    const sk = f.querySelector('[data-skip]');
    if (sk) sk.onclick = () => { leadOpen = false; modalLocked = false; closeModal(); store.set(LK, 'skipped'); };
    return true;
  }

  /* ---------- reading aids ---------- */
  let auto = null;
  function stopAuto() { if (auto) { clearInterval(auto); auto = null; root.querySelector('[data-act=autoplay]')?.classList.remove('on'); } }
  function toggleAuto() {
    if (auto) return stopAuto();
    root.querySelector('[data-act=autoplay]')?.classList.add('on'); toast(`Slideshow: every ${S.autoplaySeconds || 6}s`);
    auto = setInterval(() => { if (fb.visible().includes(book.pages.length - 1)) stopAuto(); else fb.next(); }, (S.autoplaySeconds || 6) * 1000);
  }
  let speaking = false;
  function speakVisible() {
    if (!speaking) return;
    const txt = fb.visible().map(i => book.pages[i].text || '').join('\n').trim();
    const u = new SpeechSynthesisUtterance(txt || ' ');
    u.lang = document.documentElement.lang || navigator.language || 'en';
    u.rate = 1;
    u.onend = () => { if (!speaking) return; if (fb.visible().includes(book.pages.length - 1)) toggleTts(); else fb.next().then(speakVisible); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function toggleTts() {
    speaking = !speaking; root.querySelector('[data-act=tts]')?.classList.toggle('on', speaking);
    if (speaking) { toast('Reading aloud…'); speakVisible(); } else speechSynthesis.cancel();
  }
  let music = null;
  async function toggleMusic(force) {
    if (!music) { music = new Audio(await getUrl(S.music.blob || S.music.src)); music.loop = true; music.volume = S.music.volume ?? 0.4; }
    const on = force ?? music.paused;
    if (on) music.play().catch(() => {}); else music.pause();
    root.querySelector('[data-act=music]')?.classList.toggle('on', on);
  }
  let soundOn = S.flipSound !== false && store.get('ffsound', true);
  const flipSound = makeFlipSound();

  /* ---------- engine ---------- */
  await passwordGate();
  const bookEl = $('.fv-book');
  let startPage = opts.startPage ?? S.startPage ?? 0;
  const hm = /[#&]page=(\d+)/.exec(location.hash); if (hm && mode !== 'preview') startPage = Math.max(0, +hm[1] - 1);
  let lastVis = [], lastT = Date.now();
  const fb = new Flipbook(bookEl, {
    pageCount: book.pages.length,
    aspect: book.aspect || 0.7071,
    mode: S.layout || 'auto',
    effect: S.effect || 'flip',
    rtl: !!S.rtl,
    hardcover: !!S.hardcover,
    startPage,
    keyboard: opts.keyboard !== false,
    renderPage,
    onMount: (n) => n.classList.add('fx-shown'),
    sound: () => { if (soundOn) flipSound(); },
    onFlipStart: () => { closeDrawerIfMobile(); },
    onChange: (st) => {
      const now = Date.now();
      for (const p of lastVis) emit('page', { page: p, ms: now - lastT });
      lastVis = st.visible; lastT = now;
      st.visible.forEach(p => session.pages.add(p));
      const label = st.visible.map(i => i + 1).join('–');
      $('.fv-cur').textContent = label; $('.fv-range').value = Math.max(...st.visible) + 1;
      $('.fv-live').textContent = `Page ${label} of ${st.count}`;
      $('.fv-prev').disabled = st.visible.includes(0); $('.fv-next').disabled = st.visible.includes(st.count - 1);
      fb.cache.forEach((n, i) => { if (!st.visible.includes(i) && !n.isConnected) n.classList.remove('fx-shown'); });
      if (st.visible.includes(st.count - 1)) emit('complete', {});
      if (mode !== 'preview' && opts.updateHash !== false) try { history.replaceState(null, '', '#page=' + (st.visible[0] + 1)); } catch { /* sandboxed */ }
      if (drawerTab === 'thumbs') markThumbs();
      if (drawerTab === 'bookmark') renderBookmarks($('.fv-drawer-body'));
      if (leadGate(st.visible)) { /* gate shown */ }
      opts.onPage && opts.onPage(st);
    },
  });
  function closeDrawerIfMobile() { if (isMobile() && drawerTab) closeDrawer(); }
  let pendingQ = null;
  function go(i, q) {
    pendingQ = q;
    return fb.goTo(i).then(() => { if (pendingQ) { highlight(i, pendingQ); pendingQ = null; } });
  }
  emit('open', { device: isMobile() ? 'mobile' : (matchMedia('(pointer:coarse)').matches ? 'tablet' : 'desktop'), ref: document.referrer ? new URL(document.referrer).hostname : 'direct' });
  updateCartBadge();
  if (root.querySelector('[data-act=sound]')) root.querySelector('[data-act=sound]').innerHTML = icon(soundOn ? 'sound' : 'mute');
  if (S.music?.autoplay) { const once = () => { toggleMusic(true); window.removeEventListener('pointerdown', once); }; window.addEventListener('pointerdown', once); }

  /* ---------- controls ---------- */
  const range = $('.fv-range');
  range.addEventListener('input', () => { $('.fv-cur').textContent = range.value; });
  range.addEventListener('change', () => go(range.value - 1));
  V.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    switch (a) {
      case 'prev': fb.prev(); break;
      case 'next': fb.next(); break;
      case 'first': fb.first(); break;
      case 'last': fb.last(); break;
      case 'jump': { const v = prompt(`Go to page (1–${book.pages.length})`); if (v) go(parseInt(v, 10) - 1); break; }
      case 'thumbs': openDrawer('thumbs'); break;
      case 'toc': openDrawer('toc'); break;
      case 'search': openDrawer('search'); break;
      case 'bookmark': openDrawer('bookmark'); break;
      case 'closedrawer': closeDrawer(); break;
      case 'closemodal': closeModal(); break;
      case 'zoomin': fb.setZoom(fb.zoom + 0.5); break;
      case 'zoomout': fb.setZoom(fb.zoom - 0.5); break;
      case 'autoplay': toggleAuto(); break;
      case 'tts': toggleTts(); break;
      case 'music': toggleMusic(); break;
      case 'sound': soundOn = !soundOn; store.set('ffsound', soundOn); b.innerHTML = icon(soundOn ? 'sound' : 'mute'); toast(soundOn ? 'Flip sound on' : 'Flip sound off'); break;
      case 'night': V.classList.toggle('fv-night'); b.classList.toggle('on'); break;
      case 'share': openShare(); break;
      case 'cart': openCart(); break;
      case 'cta': emit('click', { kind: 'cta' }); break;
      case 'fullscreen': {
        const el = V;
        if (document.fullscreenElement) document.exitFullscreen();
        else (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
        break;
      }
      case 'download': { const u = await getUrl(book.sourcePdf); if (u) { const l = document.createElement('a'); l.href = u; l.download = (book.title || 'publication') + '.pdf'; l.click(); emit('download', {}); } break; }
      case 'print': printBook(); break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!root.isConnected) return;
    if (e.key === 'Escape') { if (!$('.fv-modal').hidden) closeModal(); else if (drawerTab) closeDrawer(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && T.search !== false && mode !== 'preview') { e.preventDefault(); openDrawer('search'); }
  });

  async function printBook() {
    emit('print', {});
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print');
    const H = Math.round(800 / book.aspect);
    const parts = await Promise.all(book.pages.map(async p => p.kind === 'image' ? `<div class="pg"><img src="${await getUrl(p.image)}"></div>` : `<div class="pg"><div class="h" style="height:${H}px">${sanitize(p.html)}</div></div>`));
    const css = [...document.querySelectorAll('style, link[rel=stylesheet]')].map(n => n.outerHTML).join('');
    w.document.write(`<!doctype html><html><head><title>${esc(book.title)}</title>${css}<style>body{margin:0;background:#fff}.pg{page-break-after:always;break-after:page;position:relative;width:100%;aspect-ratio:${book.aspect};overflow:hidden}.pg img{width:100%;height:100%;object-fit:contain}.h{position:relative;width:800px;zoom:calc(100vw / 800px)}.fx-anim{opacity:1!important;animation:none!important}</style></head><body class="fx-static">${parts.join('')}<script>onload=()=>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  }

  // flush analytics on leave
  const flush = () => {
    const now = Date.now();
    for (const p of lastVis) emit('page', { page: p, ms: now - lastT });
    lastT = now;
    emit('close', { ms: now - session.start, pages: session.pages.size, clicks: session.clicks });
    hook({ type: 'session', ms: now - session.start, pagesViewed: session.pages.size, clicks: session.clicks, device: isMobile() ? 'mobile' : 'desktop' });
  };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  if (mode !== 'preview') document.addEventListener('visibilitychange', onHide);

  return {
    fb,
    goTo: (i) => fb.goTo(i),
    destroy() { document.removeEventListener('visibilitychange', onHide); speechSynthesis?.cancel?.(); music?.pause(); stopAuto(); fb.destroy(); root.innerHTML = ''; },
    stats: () => ({ ...session, ms: Date.now() - session.start }),
  };
}
export { fmtTime };
