// End-to-end checks: run with `npm test` (needs Playwright + Chromium).
// Starts a static server, then exercises landing, templates, editor, preview, PDF import, export and the standalone reader.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ✓ ' + m); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-'));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  try {
    console.log('Landing'); await p.goto(base + '/index.html'); await p.waitForSelector('#demo .fv-pg');
    await p.click('#demo .fv-next'); await p.waitForTimeout(900); ok((await p.locator('#demo .fv-cur').textContent()).includes('2'), 'demo flips');
    console.log('Template → editor'); await p.goto(base + '/studio.html#/templates'); await p.waitForSelector('.tpl');
    await p.click('.tpl[data-id="course"]'); await p.waitForSelector('.editor'); ok(await p.locator('.ed-pg').count() > 4, 'pages composed');
    await p.click('[data-tool="video"]'); const c = await p.locator('[data-canvas]').boundingBox();
    await p.mouse.move(c.x + 50, c.y + 60); await p.mouse.down(); await p.mouse.move(c.x + 220, c.y + 160, { steps: 4 }); await p.mouse.up();
    ok(await p.locator('.hs-box.sel').count() === 1, 'hotspot drawn');
    await p.fill('[data-k="data.url"]', 'https://youtu.be/dQw4w9WgXcQ'); await p.press('[data-k="data.url"]', 'Tab');
    await p.click('[data-preview]'); await p.waitForSelector('.preview-frame .ff-hotspot'); ok(true, 'preview shows hotspot'); await p.click('.preview-frame [data-close]');
    console.log('PDF import'); await p.goto('about:blank');
    const mk = await b.newPage(); await mk.setContent('<style>section{height:100vh;page-break-after:always;font:28px sans-serif;padding:60px}</style>' + [1, 2, 3, 4].map(i => `<section><h1>Chapter ${i}</h1><p>needle ${i}</p><a href="https://example.com/${i}">link</a></section>`).join(''));
    await mk.pdf({ path: tmp + '/t.pdf', format: 'A4' }); await mk.close();
    await p.goto(base + '/studio.html#/new');
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-c="pdf"]')]); await fc.setFiles(tmp + '/t.pdf'); await p.click('[data-start]');
    await p.waitForSelector('.editor', { timeout: 60000 }); ok(await p.locator('.hs-box.auto').count() >= 1, 'PDF links auto-detected');
    console.log('Export'); await p.click('[data-tab="publish"]');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-html]')]); await dl.saveAs(tmp + '/out.html');
    const v = await ctx.newPage(); await v.goto('file://' + tmp + '/out.html'); await v.waitForSelector('.fv-pg img');
    await v.click('[data-act="search"]'); await v.fill('.fv-search input', 'needle'); await v.waitForTimeout(200);
    ok(await v.locator('.fv-hit').count() >= 4, 'standalone export searchable');
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    console.log('\nAll checks passed');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  await b.close(); server.close();
})();
