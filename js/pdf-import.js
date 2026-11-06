// PDF -> page images + searchable text + auto-detected links.
import { db, uid } from './db.js';

let pdfjs = null;
async function lib() {
  if (pdfjs) return pdfjs;
  const base = new URL('../vendor/', import.meta.url);
  pdfjs = await import(new URL('pdf.min.mjs', base).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
  return pdfjs;
}

function canvasToBlob(canvas, type = 'image/webp', q = 0.86) {
  return new Promise((res) => canvas.toBlob(b => {
    if (b && b.type === type) return res(b);
    canvas.toBlob(res, 'image/jpeg', q);   // Safari: no webp encoder
  }, type, q));
}

/**
 * Convert a PDF file into book pages.
 * @param {File|Blob} file
 * @param {{quality?: 'standard'|'high'|'ultra', onProgress?: (done, total, thumbUrl) => void, signal?: AbortSignal}} opts
 * @returns {Promise<{pages, hotspots, aspect, title, outline}>}
 */
export async function importPdf(file, opts = {}) {
  const pdf = await lib();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdf.getDocument({ data, isEvalSupported: false }).promise;
  const targetH = { standard: 1400, high: 2000, ultra: 2800 }[opts.quality || 'high'];
  const pages = [], hotspots = [];
  let aspect = 0.7071;
  const meta = await doc.getMetadata().catch(() => null);
  const title = (meta?.info?.Title || '').trim() || (file.name || 'Untitled').replace(/\.pdf$/i, '');

  // map PDF named/explicit destinations to page indices
  const resolveDest = async (dest) => {
    try {
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (!Array.isArray(dest)) return null;
      const ref = dest[0];
      return typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
    } catch { return null; }
  };

  for (let i = 1; i <= doc.numPages; i++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const page = await doc.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    if (i === 1) aspect = vp1.width / vp1.height;
    const scale = targetH / vp1.height;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, annotationMode: pdf.AnnotationMode.ENABLE }).promise;
    const img = await canvasToBlob(canvas);
    const tc = document.createElement('canvas');
    tc.height = 320; tc.width = Math.round(320 * canvas.width / canvas.height);
    tc.getContext('2d').drawImage(canvas, 0, 0, tc.width, tc.height);
    const thumb = await canvasToBlob(tc, 'image/webp', 0.75);
    const [imageKey, thumbKey] = await Promise.all([db.putBlob(img), db.putBlob(thumb)]);

    // text with normalised boxes (for search highlighting + read aloud)
    const words = [];
    let text = '';
    try {
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) { if (it.hasEOL) text += '\n'; continue; }
        const [, , , d, e, f] = it.transform;
        const h = Math.abs(d) || it.height || 10;
        const [x0, y0] = vp1.convertToViewportPoint(e, f + h);
        words.push({ s: it.str, x: x0 / vp1.width, y: y0 / vp1.height, w: it.width / vp1.width, h: h / vp1.height });
        text += it.str + (it.hasEOL ? '\n' : ' ');
      }
    } catch { /* image-only page */ }

    // auto-detect links
    try {
      const annots = await page.getAnnotations();
      for (const a of annots) {
        if (a.subtype !== 'Link' || !a.rect) continue;
        const [x1, y1, x2, y2] = vp1.convertToViewportRectangle(a.rect);
        const box = { x: Math.min(x1, x2) / vp1.width, y: Math.min(y1, y2) / vp1.height, w: Math.abs(x2 - x1) / vp1.width, h: Math.abs(y2 - y1) / vp1.height };
        if (a.url || a.unsafeUrl) hotspots.push({ id: uid('hs_'), page: i - 1, ...box, type: 'link', data: { url: a.url || a.unsafeUrl, newTab: true }, style: { pulse: false }, auto: true });
        else if (a.dest) {
          const p = await resolveDest(a.dest);
          if (p != null) hotspots.push({ id: uid('hs_'), page: i - 1, ...box, type: 'page', data: { page: p }, style: { pulse: false }, auto: true });
        }
      }
    } catch { /* ignore */ }

    pages.push({ id: uid('pg_'), kind: 'image', image: imageKey, thumb: thumbKey, text: text.trim(), words, w: canvas.width, h: canvas.height });
    opts.onProgress?.(i, doc.numPages, URL.createObjectURL(thumb));
    page.cleanup();
  }

  // outline -> table of contents
  const outline = [];
  try {
    const ol = await doc.getOutline();
    const walk = async (items, depth) => {
      for (const it of items || []) {
        const p = await resolveDest(it.dest);
        if (p != null) outline.push({ title: it.title, page: p, depth });
        if (depth < 2) await walk(it.items, depth + 1);
      }
    };
    await walk(ol, 0);
  } catch { /* none */ }

  const sourcePdf = await db.putBlob(new Blob([data], { type: 'application/pdf' }));
  await doc.destroy();
  return { pages, hotspots, aspect, title, outline, sourcePdf };
}

/** Images (photo album / scanned pages) -> book pages. */
export async function importImages(files, { onProgress } = {}) {
  const pages = [];
  let aspect = 0.7071;
  let n = 0;
  for (const f of files) {
    const bmp = await createImageBitmap(f);
    if (n === 0) aspect = bmp.width / bmp.height;
    const maxH = 2000;
    const s = Math.min(1, maxH / bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const img = await canvasToBlob(c);
    const tc = document.createElement('canvas'); tc.height = 320; tc.width = Math.round(320 * c.width / c.height);
    tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
    const thumb = await canvasToBlob(tc, 'image/webp', 0.75);
    pages.push({ id: uid('pg_'), kind: 'image', image: await db.putBlob(img), thumb: await db.putBlob(thumb), text: '', words: [], w: c.width, h: c.height, fit: 'cover' });
    n++; onProgress?.(n, files.length, URL.createObjectURL(thumb));
  }
  return { pages, aspect };
}
