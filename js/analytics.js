// Analytics dashboard: sessions, reading time, page heatmap, interactions, leads.
import { db } from './db.js';
import { icon, esc, pagePreview } from './ui.js';
import { fmtTime } from './util.js';
import { download, slug } from './export.js';

export function summarize(book, events) {
  const sessions = new Map();
  for (const e of events) {
    if (!sessions.has(e.session)) sessions.set(e.session, { id: e.session, start: e.ts, end: e.ts, pages: new Set(), clicks: 0, device: 'desktop', ref: 'direct', complete: false, ms: 0 });
    const s = sessions.get(e.session);
    s.start = Math.min(s.start, e.ts); s.end = Math.max(s.end, e.ts);
    if (e.type === 'open') { s.device = e.device; s.ref = e.ref; }
    if (e.type === 'page') { s.pages.add(e.page); s.ms += Math.min(e.ms || 0, 10 * 60 * 1000); }
    if (e.type === 'click' || e.type === 'quiz' || e.type === 'cart') s.clicks++;
    if (e.type === 'complete') s.complete = true;
  }
  const list = [...sessions.values()].filter(s => s.pages.size || s.ms);
  const n = list.length || 1;
  const pageMs = new Array(book.pages.length).fill(0), pageViews = new Array(book.pages.length).fill(0);
  for (const e of events) if (e.type === 'page' && e.page < book.pages.length) { pageMs[e.page] += Math.min(e.ms || 0, 600000); pageViews[e.page]++; }
  const clicks = {};
  for (const e of events) if (e.type === 'click' && e.hotspot) clicks[e.hotspot] = (clicks[e.hotspot] || 0) + 1;
  const kinds = {};
  for (const e of events) if (e.type === 'click') kinds[e.kind || 'link'] = (kinds[e.kind || 'link'] || 0) + 1;
  const quiz = events.filter(e => e.type === 'quiz');
  const days = {};
  for (const s of list) { const d = new Date(s.start).toISOString().slice(0, 10); days[d] = (days[d] || 0) + 1; }
  const count = (k) => list.reduce((o, s) => { o[s[k]] = (o[s[k]] || 0) + 1; return o; }, {});
  return {
    sessions: list.length,
    avgMs: list.reduce((a, s) => a + s.ms, 0) / n,
    avgPages: list.reduce((a, s) => a + s.pages.size, 0) / n,
    completion: list.filter(s => s.complete).length / n,
    clicks: events.filter(e => e.type === 'click').length,
    searches: events.filter(e => e.type === 'search').map(e => e.q),
    shares: events.filter(e => e.type === 'share').length,
    orders: events.filter(e => e.type === 'order').length,
    quizRate: quiz.length ? quiz.filter(q => q.correct).length / quiz.length : null, quizN: quiz.length,
    pageMs, pageViews, clicks, kinds, days, devices: count('device'), refs: count('ref'), list,
  };
}

export async function analyticsView(shell, id) {
  const books = await db.listBooks();
  if (!id) {
    const rows = await Promise.all(books.map(async b => ({ b, s: summarize(b, await db.events(b.id)), leads: (await db.leads(b.id)).length })));
    const main = shell('stats', `
      <div class="page-head"><div><h1>Analytics</h1><p>How readers engage with each publication. Data collected by the reader on this device; exported sites can send events to your webhook or Google Analytics.</p></div></div>
      <div class="content">${rows.length ? `<div class="card" style="overflow:auto"><table class="t"><thead><tr><th>Publication</th><th>Sessions</th><th>Avg. time</th><th>Pages / session</th><th>Read to end</th><th>Clicks</th><th>Leads</th><th></th></tr></thead><tbody>
        ${rows.map(({ b, s, leads }) => `<tr><td><b>${esc(b.title)}</b><br><span class="faint">${b.pages.length} pages</span></td><td>${s.sessions}</td><td>${fmtTime(s.avgMs)}</td><td>${s.avgPages.toFixed(1)}</td><td>${Math.round(s.completion * 100)}%</td><td>${s.clicks}</td><td>${leads}</td><td><a class="btn sm" href="#/stats/${b.id}">Details</a></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${icon('chart', 40)}<h2>No publications yet</h2></div>`}</div>`);
    return main;
  }
  const book = books.find(b => b.id === id);
  if (!book) { location.hash = '#/stats'; return; }
  const [events, leads] = await Promise.all([db.events(id), db.leads(id)]);
  const s = summarize(book, events);
  const maxMs = Math.max(1, ...s.pageMs);
  const dayKeys = []; for (let i = 13; i >= 0; i--) dayKeys.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const maxDay = Math.max(1, ...dayKeys.map(d => s.days[d] || 0));
  const hsName = (hid) => { const h = (book.hotspots || []).find(x => x.id === hid); return h ? `${h.type} · p.${h.page + 1} ${esc(h.data?.url || h.data?.title || h.data?.name || h.data?.text || '')}` : hid; };
  const pct = (o) => { const t = Object.values(o).reduce((a, b) => a + b, 0) || 1; return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(k)}</span><b>${Math.round(v / t * 100)}%</b></div>`).join('') || '<p class="faint">No data yet</p>'; };
  const main = shell('stats', `
    <div class="page-head"><div><a href="#/stats" class="faint" style="font-size:13px;text-decoration:none">← All publications</a><h1>${esc(book.title)}</h1><p>Engagement analytics</p></div>
      <div class="row wrap"><a class="btn" href="viewer.html?id=${id}" target="_blank">${icon('eye', 16)} Open reader</a><button class="btn" data-csv>${icon('download', 16)} Export events CSV</button><button class="btn danger" data-clear>Reset</button></div></div>
    <div class="content">
      <div class="tiles">
        <div class="tile"><span>Sessions</span><b>${s.sessions}</b></div>
        <div class="tile"><span>Avg. reading time</span><b>${fmtTime(s.avgMs)}</b></div>
        <div class="tile"><span>Pages per session</span><b>${s.avgPages.toFixed(1)}</b><small>of ${book.pages.length}</small></div>
        <div class="tile"><span>Read to the end</span><b>${Math.round(s.completion * 100)}%</b></div>
        <div class="tile"><span>Interactions</span><b>${s.clicks}</b><small>${s.shares} shares · ${s.orders} orders</small></div>
        <div class="tile"><span>Leads</span><b>${leads.length}</b>${s.quizRate != null ? `<small>quiz accuracy ${Math.round(s.quizRate * 100)}% (${s.quizN})</small>` : ''}</div>
      </div>
      <div class="card chart-card"><h3>Sessions — last 14 days</h3><div class="bars" style="height:140px;margin-bottom:22px">${dayKeys.map(d => `<div class="b" style="height:${(s.days[d] || 0) / maxDay * 100}%"><em>${s.days[d] || 0}</em><span>${d.slice(8)}</span></div>`).join('')}</div></div>
      <div class="card chart-card"><h3>Attention heatmap — time spent per page</h3><p class="muted" style="margin-top:-6px;font-size:13px">Brighter = more reading time. Hover for details.</p>
        <div class="heat">${s.pageMs.map((ms, i) => `<div data-pg="${i}" title="Page ${i + 1}: ${fmtTime(ms)} total, ${s.pageViews[i]} views" style="background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.55)), center/cover; position:relative;outline:3px solid hsla(${250 - 200 * (ms / maxMs)},90%,60%,${0.25 + 0.75 * ms / maxMs});outline-offset:-3px">${i + 1}</div>`).join('')}</div></div>
      <div class="split">
        <div class="card chart-card"><h3>Most clicked elements</h3>${Object.keys(s.clicks).length ? `<table class="t"><tbody>${Object.entries(s.clicks).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `<tr><td>${hsName(k)}</td><td style="text-align:right"><b>${v}</b></td></tr>`).join('')}</tbody></table>` : '<p class="faint">No clicks yet</p>'}
          <h3 style="margin-top:18px">By type</h3>${pct(s.kinds)}</div>
        <div class="card chart-card"><h3>Devices</h3>${pct(s.devices)}<h3 style="margin-top:18px">Traffic sources</h3>${pct(s.refs)}
          <h3 style="margin-top:18px">Reader searches</h3>${s.searches.length ? [...new Set(s.searches)].slice(-15).map(q => `<span class="pill" style="margin:2px">${esc(q)}</span>`).join('') : '<p class="faint">None yet</p>'}</div>
      </div>
      <div class="card chart-card"><h3>Leads (${leads.length})</h3>${leads.length ? `<table class="t"><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Other</th></tr></thead><tbody>${leads.map(l => `<tr><td>${new Date(l.ts).toLocaleString()}</td><td>${esc(l.name || '')}</td><td>${esc(l.email || '')}</td><td>${esc([l.phone, l.company, l.role, l.message].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table>` : '<p class="faint">Enable the lead form in the editor’s Settings tab.</p>'}</div>
    </div>`);
  main.querySelectorAll('.heat [data-pg]').forEach(el => { const box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0;z-index:-1;border-radius:6px;overflow:hidden;background:#fff center/cover'; el.style.zIndex = 0; el.prepend(box); pagePreview(box, book.pages[+el.dataset.pg]); });
  main.querySelector('[data-csv]').onclick = () => {
    const rows = [['time', 'session', 'type', 'page', 'ms', 'detail'], ...events.map(e => [new Date(e.ts).toISOString(), e.session, e.type, e.page ?? '', e.ms ?? '', e.kind || e.q || e.via || e.hotspot || ''])];
    download(slug(book.title) + '-events.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  main.querySelector('[data-clear]').onclick = async () => { if (confirm('Reset analytics for this publication?')) { await db.clearEvents(id); analyticsView(shell, id); } };
}
