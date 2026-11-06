// IndexedDB persistence: books, binary blobs (page images, PDFs, media), analytics events, leads.
const DB_NAME = 'flipforge';
const DB_VER = 1;
let _db = null;

function open() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('events')) {
        const s = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        s.createIndex('book', 'book');
      }
      if (!db.objectStoreNames.contains('leads')) {
        const s = db.createObjectStore('leads', { keyPath: 'id', autoIncrement: true });
        s.createIndex('book', 'book');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return _db;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const db = {
  async listBooks() {
    const all = await tx('books', 'readonly', s => reqP(s.getAll()));
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  getBook: (id) => tx('books', 'readonly', s => reqP(s.get(id))),
  async saveBook(book) {
    book.updatedAt = Date.now();
    await tx('books', 'readwrite', s => reqP(s.put(book)));
    return book;
  },
  async deleteBook(id) {
    const b = await db.getBook(id);
    if (b) {
      const keys = collectBlobKeys(b);
      await tx('blobs', 'readwrite', s => Promise.all(keys.map(k => reqP(s.delete(k)))));
    }
    await tx('books', 'readwrite', s => reqP(s.delete(id)));
    await db.clearEvents(id);
  },
  async putBlob(blob, key = uid('b_')) { await tx('blobs', 'readwrite', s => reqP(s.put(blob, key))); return key; },
  getBlob: (key) => tx('blobs', 'readonly', s => reqP(s.get(key))),
  deleteBlob: (key) => tx('blobs', 'readwrite', s => reqP(s.delete(key))),

  addEvent: (ev) => tx('events', 'readwrite', s => reqP(s.add({ ts: Date.now(), ...ev }))),
  events: (book) => tx('events', 'readonly', s => reqP(s.index('book').getAll(book))),
  clearEvents: (book) => tx('events', 'readwrite', s => new Promise((res) => {
    const r = s.index('book').openCursor(book);
    r.onsuccess = () => { const c = r.result; if (c) { c.delete(); c.continue(); } else res(); };
  })),
  addLead: (lead) => tx('leads', 'readwrite', s => reqP(s.add({ ts: Date.now(), ...lead }))),
  leads: (book) => book ? tx('leads', 'readonly', s => reqP(s.index('book').getAll(book))) : tx('leads', 'readonly', s => reqP(s.getAll())),
  deleteLead: (id) => tx('leads', 'readwrite', s => reqP(s.delete(id))),

  getKV: (k) => tx('kv', 'readonly', s => reqP(s.get(k))),
  setKV: (k, v) => tx('kv', 'readwrite', s => reqP(s.put(v, k))),
};

export function collectBlobKeys(book) {
  const keys = [];
  for (const p of book.pages || []) { if (p.image) keys.push(p.image); if (p.thumb) keys.push(p.thumb); }
  for (const h of book.hotspots || []) {
    for (const k of h.blobs || []) keys.push(k);
    if (h.data?.blob) keys.push(h.data.blob);
    for (const k of h.data?.images || []) if (/^b_/.test(k)) keys.push(k);
  }
  if (book.settings?.music?.blob) keys.push(book.settings.music.blob);
  if (book.sourcePdf) keys.push(book.sourcePdf);
  if (book.settings?.logoBlob) keys.push(book.settings.logoBlob);
  if (book.settings?.bgBlob) keys.push(book.settings.bgBlob);
  return keys;
}

/** Default settings for a new book. */
export function defaultSettings(type = 'ebook') {
  return {
    layout: 'auto',              // auto | single | double
    effect: 'flip',              // flip | slide | fade
    hardcover: ['ebook', 'catalog', 'album', 'yearbook'].includes(type),
    rtl: false,
    skin: 'dark',                // dark | light | glass
    accent: '#6d5efc',
    background: { kind: 'gradient', value: 'radial-gradient(1200px 700px at 50% 30%, #2b2f4a, #0d0f1a)' },
    logoBlob: null, logoLink: '',
    cta: { enabled: false, label: 'Get in touch', url: '' },
    tools: { thumbnails: true, toc: true, search: true, zoom: true, fullscreen: true, share: true, download: false, print: false, sound: true, autoplay: true, tts: true, bookmarks: true, notes: true, night: true },
    flipSound: true,
    autoplaySeconds: 6,
    highlightLinks: true,
    startPage: 0,
    toc: [],
    password: { enabled: false, hash: '' },
    lead: { enabled: false, page: 3, title: 'Unlock the rest of this publication', text: 'Leave your details to keep reading.', fields: ['name', 'email'], skippable: false, consent: 'I agree to be contacted about this content.' },
    integrations: { webhook: '', ga4: '' },
    seo: { description: '', indexable: true },
    shop: { email: '', whatsapp: '' },
    music: { src: '', blob: null, autoplay: false, volume: 0.4 },
    backlink: true,
  };
}

export function newBook({ title = 'Untitled publication', type = 'ebook', aspect = 0.7071 } = {}) {
  return {
    id: uid('bk_'),
    title, type, aspect,
    createdAt: Date.now(), updatedAt: Date.now(),
    pages: [],         // { id, kind: 'image'|'html', image?: blobKey, thumb?: blobKey, html?: string, text?: string, words?: [] }
    hotspots: [],      // { id, page, x, y, w, h (0..1), type, data, style }
    settings: defaultSettings(type),
    source: null,      // for composed books: { theme, markdown, meta }
    sourcePdf: null,
  };
}
