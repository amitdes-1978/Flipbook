// FlipForge page-flip engine.
// Renders a book of N pages with a 3D page-turn (or slide / fade) effect.
// Pages are supplied lazily through opts.renderPage(index) which must return a DOM node.

const INTERACTIVE = 'a,button,input,select,textarea,iframe,video,audio,label,.ff-hotspot,[data-interactive]';

export class Flipbook {
  constructor(root, opts) {
    this.root = root;
    this.o = Object.assign({
      pageCount: 0,
      aspect: 0.7071,          // page width / height
      mode: 'auto',            // auto | single | double
      effect: 'flip',          // flip | slide | fade
      rtl: false,
      duration: 750,
      hardcover: false,
      startPage: 0,
      zoom: 1,
      renderPage: () => document.createElement('div'),
      onChange: () => {},
      onFlipStart: () => {},
    }, opts);
    this.cache = new Map();
    this.busy = false;
    this.page = 0;           // index of the "anchor" page (right page of spread in double mode)
    this.zoom = this.o.zoom;
    this._build();
    this._bind();
    this.layout();
    this.page = Math.max(0, Math.min(this.o.pageCount - 1, this.o.startPage | 0));
    this._renderStatic();
    queueMicrotask(() => this._emit());   // let the caller finish wiring before the first change event
  }

  /* ---------- public API ---------- */
  get double() { return this._double; }
  get count() { return this.o.pageCount; }

  /** Pages currently visible (indices). */
  visible() {
    if (!this._double) return [this.page];
    const s = this._spreadOf(this.page);
    return this._spreadPages(s).filter(i => i != null);
  }

  next() { return this._turn(+1); }
  prev() { return this._turn(-1); }
  first() { return this.goTo(0); }
  last() { return this.goTo(this.o.pageCount - 1); }

  goTo(index, animate = true) {
    index = Math.max(0, Math.min(this.o.pageCount - 1, index | 0));
    if (this.busy) return Promise.resolve();
    const cur = this._double ? this._spreadOf(this.page) : this.page;
    const tgt = this._double ? this._spreadOf(index) : index;
    if (animate && tgt !== cur && Math.abs(tgt - cur) === 1) return this._turn(tgt > cur ? 1 : -1);
    if (animate && tgt !== cur) return this._jump(index);
    this.page = index;
    this._renderStatic();
    this._emit();
    return Promise.resolve();
  }

  setOptions(patch) {
    Object.assign(this.o, patch);
    if ('pageCount' in patch || 'renderPage' in patch) this.cache.clear();
    this.root.classList.toggle('ff-rtl', !!this.o.rtl);
    this.root.classList.toggle('ff-hardcover', !!this.o.hardcover);
    this.layout();
    this.goTo(Math.min(this.page, this.o.pageCount - 1), false);
  }

  /** Force re-render of one page (e.g. after editing hotspots). */
  invalidate(index) {
    if (index == null) this.cache.clear(); else this.cache.delete(index);
    this._renderStatic();
  }

  setZoom(z) {
    this.zoom = Math.max(1, Math.min(4, z));
    this.layout();
    this._emit();
  }

  destroy() {
    this._ro && this._ro.disconnect();
    window.removeEventListener('keydown', this._onKey);
    this.root.innerHTML = '';
  }

  /* ---------- layout ---------- */
  _build() {
    this.root.classList.add('ff-book');
    this.root.classList.toggle('ff-rtl', !!this.o.rtl);
    this.root.classList.toggle('ff-hardcover', !!this.o.hardcover);
    this.root.innerHTML = `
      <div class="ff-scroller"><div class="ff-stage">
        <div class="ff-shadow"></div>
        <div class="ff-half ff-left"></div>
        <div class="ff-half ff-right"></div>
        <div class="ff-spine"></div>
        <div class="ff-leaf" hidden>
          <div class="ff-face ff-front"></div>
          <div class="ff-face ff-back"></div>
        </div>
        <div class="ff-corner" aria-hidden="true"></div>
      </div></div>`;
    this.scroller = this.root.querySelector('.ff-scroller');
    this.stage = this.root.querySelector('.ff-stage');
    this.left = this.root.querySelector('.ff-left');
    this.right = this.root.querySelector('.ff-right');
    this.leaf = this.root.querySelector('.ff-leaf');
    this.front = this.root.querySelector('.ff-front');
    this.back = this.root.querySelector('.ff-back');
  }

  layout() {
    const r = this.root.getBoundingClientRect();
    const W = Math.max(200, r.width - 24), H = Math.max(200, r.height - 24);
    const a = this.o.aspect;
    let dbl = this.o.mode === 'double' || (this.o.mode === 'auto' && W > 640 && W / H > a * 1.45);
    if (this.o.pageCount < 2) dbl = false;
    const changed = dbl !== this._double;
    this._double = dbl;
    let ph = H, pw = ph * a;
    const cols = dbl ? 2 : 1;
    if (pw * cols > W) { pw = W / cols; ph = pw / a; }
    pw = Math.floor(pw * this.zoom); ph = Math.floor(ph * this.zoom);
    this.pw = pw; this.ph = ph;
    this.root.classList.toggle('ff-double', dbl);
    this.root.classList.toggle('ff-single', !dbl);
    this.root.classList.toggle('ff-zoomed', this.zoom > 1);
    this.stage.style.width = pw * cols + 'px';
    this.stage.style.height = ph + 'px';
    this.root.style.setProperty('--ff-pw', pw + 'px');
    this.root.style.setProperty('--ff-ph', ph + 'px');
    this.root.style.setProperty('--ff-scale', String(pw / 800));
    if (changed && this._ready) this._renderStatic();
    this._ready = true;
  }

  _bind() {
    this._ro = new ResizeObserver(() => this.layout());
    this._ro.observe(this.root);

    this._onKey = (e) => {
      if (!this.root.isConnected || e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
      const fwd = this.o.rtl ? 'ArrowLeft' : 'ArrowRight';
      const bwd = this.o.rtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === 'PageDown') { this.next(); e.preventDefault(); }
      else if (e.key === bwd || e.key === 'PageUp') { this.prev(); e.preventDefault(); }
      else if (e.key === 'Home') this.first();
      else if (e.key === 'End') this.last();
    };
    if (this.o.keyboard !== false) window.addEventListener('keydown', this._onKey);

    // pointer: click halves to turn, drag from outer edges to peel
    let drag = null;
    this.stage.addEventListener('pointerdown', (e) => {
      if (this.busy || e.button > 0 || this.zoom > 1) return;
      if (e.target.closest(INTERACTIVE)) return;
      const rect = this.stage.getBoundingClientRect();
      let x = e.clientX - rect.left; if (this.o.rtl) x = rect.width - x;
      const rel = x / rect.width;
      drag = { x0: e.clientX, y0: e.clientY, rel, moved: false, dir: rel > 0.5 ? 1 : -1, started: false, t: performance.now() };
      this.stage.setPointerCapture(e.pointerId);
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      let dx = e.clientX - drag.x0; if (this.o.rtl) dx = -dx;
      if (!drag.moved && Math.abs(dx) > 8) {
        drag.moved = true;
        const dir = dx < 0 ? 1 : -1;
        if (this.o.effect === 'flip' && this._canTurn(dir)) {
          drag.dir = dir; drag.started = this._beginTurn(dir);
        }
      }
      if (drag.started) {
        const span = this._double ? this.pw * 2 : this.pw * 1.4;
        let p = drag.dir > 0 ? -dx / span : 1 - dx / span;
        this._setLeaf(Math.max(0, Math.min(1, p)));
      }
    });
    const end = async (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.started) {
        let dx = e.clientX - d.x0; if (this.o.rtl) dx = -dx;
        const fast = performance.now() - d.t < 300 && Math.abs(dx) > 30;
        const span = this._double ? this.pw * 2 : this.pw * 1.4;
        const p = d.dir > 0 ? -dx / span : 1 - dx / span;
        const commit = d.dir > 0 ? (p > 0.3 || fast) : (p < 0.7 || fast);
        await this._finishTurn(d.dir, p, commit);
      } else if (!d.moved) {
        if (d.rel > 0.5 || (!this._double && d.rel > 0.35)) this.next();
        else this.prev();
      } else if (Math.abs(e.clientX - d.x0) > 40) {
        let dx = e.clientX - d.x0; if (this.o.rtl) dx = -dx;
        dx < 0 ? this.next() : this.prev();
      }
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);

    // zoom panning
    let pan = null;
    this.scroller.addEventListener('pointerdown', (e) => {
      if (this.zoom <= 1 || e.target.closest(INTERACTIVE)) return;
      pan = { x: e.clientX, y: e.clientY, sl: this.scroller.scrollLeft, st: this.scroller.scrollTop };
    });
    window.addEventListener('pointermove', (e) => {
      if (!pan) return;
      this.scroller.scrollLeft = pan.sl - (e.clientX - pan.x);
      this.scroller.scrollTop = pan.st - (e.clientY - pan.y);
    });
    window.addEventListener('pointerup', () => { pan = null; });
    this.stage.addEventListener('dblclick', (e) => {
      if (e.target.closest(INTERACTIVE)) return;
      this.setZoom(this.zoom > 1 ? 1 : 2);
    });
  }

  /* ---------- page bookkeeping ---------- */
  _spreadOf(i) { return Math.ceil(i / 2); }               // spread 0 = [null, 0], 1 = [1,2], ...
  _spreadPages(s) {
    const n = this.o.pageCount;
    const l = 2 * s - 1, r = 2 * s;
    return [l >= 0 && l < n ? l : null, r < n ? r : null];
  }
  _node(i) {
    if (i == null || i < 0 || i >= this.o.pageCount) return null;
    let n = this.cache.get(i);
    if (!n) {
      n = document.createElement('div');
      n.className = 'ff-page';
      n.dataset.index = i;
      n.classList.add(i % 2 === 0 ? 'ff-page-r' : 'ff-page-l');
      const inner = this.o.renderPage(i);
      if (inner) n.appendChild(inner);
      this.cache.set(i, n);
      if (this.cache.size > 24) {           // simple LRU-ish trim
        const vis = new Set(this.visible());
        for (const k of this.cache.keys()) { if (this.cache.size <= 16) break; if (!vis.has(k) && Math.abs(k - i) > 4) this.cache.delete(k); }
      }
    }
    return n;
  }
  _put(slot, i) {
    slot.replaceChildren();
    const n = this._node(i);
    if (n) { slot.appendChild(n); if (this.o.onMount) this.o.onMount(n, i); }
    slot.classList.toggle('ff-empty', !n);
  }

  _renderStatic() {
    this.leaf.hidden = true;
    if (this._double) {
      const [l, r] = this._spreadPages(this._spreadOf(this.page));
      this._put(this.left, l); this._put(this.right, r);
      this.left.hidden = false;
      this.root.classList.toggle('ff-cover-open', l == null);
      this.root.classList.toggle('ff-back-open', r == null);
    } else {
      this.left.hidden = true; this.left.replaceChildren();
      this._put(this.right, this.page);
      this.root.classList.remove('ff-cover-open', 'ff-back-open');
    }
    this._prefetch();
  }

  _prefetch() {
    const run = () => { for (const d of [1, 2, 3, -1, -2]) this._node(this.page + d); };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 400 }); else setTimeout(run, 120);
  }

  _canTurn(dir) {
    if (this._double) {
      const s = this._spreadOf(this.page) + dir;
      return s >= 0 && s <= this._spreadOf(this.o.pageCount - 1);
    }
    const t = this.page + dir;
    return t >= 0 && t < this.o.pageCount;
  }

  /* ---------- turning ---------- */
  async _turn(dir) {
    if (this.busy || !this._canTurn(dir)) return;
    if (this.o.effect !== 'flip') return this._jump(this._double ? this._targetIndex(dir) : this.page + dir, dir);
    this._beginTurn(dir);
    await this._finishTurn(dir, dir > 0 ? 0 : 1, true);
  }

  _targetIndex(dir) {
    const s = this._spreadOf(this.page) + dir;
    const [l, r] = this._spreadPages(s);
    return r != null ? r : l;
  }

  // prepares DOM so that leaf progress p (0 = at rest on right, 1 = flipped onto left) can be animated
  _beginTurn(dir) {
    this.busy = true;
    this.o.onFlipStart(dir);
    this.leaf.hidden = false;
    this.leaf.classList.remove('ff-leaf-single');
    if (this._double) {
      const s = this._spreadOf(this.page);
      const [l, r] = this._spreadPages(s);
      if (dir > 0) {
        const [nl, nr] = this._spreadPages(s + 1);
        this._put(this.front, r); this._put(this.back, nl);
        this._put(this.left, l); this._put(this.right, nr);
      } else {
        const [pl, pr] = this._spreadPages(s - 1);
        this._put(this.front, pr); this._put(this.back, l);
        this._put(this.left, pl); this._put(this.right, r);
      }
      this.leaf.classList.toggle('ff-leaf-cover', (dir > 0 ? r : this._spreadPages(s - 1)[1]) === 0 || (dir > 0 ? this._spreadPages(s + 1)[0] : l) === this.o.pageCount - 1);
    } else {
      this.leaf.classList.add('ff-leaf-single');
      if (dir > 0) { this._put(this.front, this.page); this._put(this.right, this.page + 1); }
      else { this._put(this.front, this.page - 1); this._put(this.right, this.page); }
      this.back.replaceChildren();
    }
    this._setLeaf(dir > 0 ? 0 : 1);
    this._playSound();
    return true;
  }

  _setLeaf(p) {
    this._p = p;
    const ang = -180 * p;
    const lift = Math.sin(p * Math.PI);
    this.leaf.style.transform = `rotateY(${ang}deg) translateZ(${lift * 2}px)`;
    this.root.style.setProperty('--ff-p', p.toFixed(4));
    this.root.style.setProperty('--ff-lift', lift.toFixed(4));
    if (!this._double) this.leaf.style.opacity = p > 0.55 ? String(Math.max(0, 1 - (p - 0.55) / 0.45)) : '1';
  }

  _finishTurn(dir, from, commit) {
    const to = commit ? (dir > 0 ? 1 : 0) : (dir > 0 ? 0 : 1);
    const dur = this.o.duration * Math.max(0.25, Math.abs(to - from));
    return new Promise((res) => {
      const t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        this._setLeaf(from + (to - from) * ease(t));
        if (t < 1) return requestAnimationFrame(step);
        if (commit) {
          if (this._double) {
            const s = this._spreadOf(this.page) + dir;
            const [l, r] = this._spreadPages(s);
            this.page = r != null ? r : l;
          } else this.page += dir;
        }
        this.leaf.style.opacity = '1';
        this.busy = false;
        this._renderStatic();
        this._emit();
        res();
      };
      requestAnimationFrame(step);
    });
  }

  // non-adjacent jumps and slide/fade effects
  _jump(index, dirHint) {
    this.busy = true;
    const dir = dirHint || (index > this.page ? 1 : -1);
    const effect = this.o.effect === 'fade' ? 'fade' : 'slide';
    const ghost = this.stage.cloneNode(false);
    ghost.className = 'ff-stage ff-ghost';
    for (const el of [this.left, this.right]) if (!el.hidden) {
      const g = el.cloneNode(true); ghost.appendChild(g);
    }
    ghost.style.position = 'absolute';
    this.scroller.appendChild(ghost);
    const sr = this.stage.getBoundingClientRect(), pr = this.scroller.getBoundingClientRect();
    ghost.style.left = (sr.left - pr.left + this.scroller.scrollLeft) + 'px';
    ghost.style.top = (sr.top - pr.top + this.scroller.scrollTop) + 'px';
    this.page = index;
    this._renderStatic();
    this._playSound();
    const sign = (this.o.rtl ? -1 : 1) * dir;
    const kOut = effect === 'fade' ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-sign * 30}%)`, opacity: 0 }];
    const kIn = effect === 'fade' ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translateX(${sign * 30}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }];
    const opt = { duration: this.o.duration * 0.6, easing: 'cubic-bezier(.2,.7,.2,1)' };
    ghost.animate(kOut, opt);
    const a = this.stage.animate(kIn, opt);
    return new Promise((res) => { a.onfinish = () => { ghost.remove(); this.busy = false; this._emit(); res(); }; });
  }

  _playSound() { if (this.o.sound) try { this.o.sound(); } catch { /* ignore */ } }
  _emit() { this.o.onChange({ page: this.page, visible: this.visible(), count: this.o.pageCount, double: this._double, zoom: this.zoom }); }
}

/** Synthesised paper "swoosh" — no audio assets required. */
export function makeFlipSound() {
  let ctx = null;
  return () => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const dur = 0.32, sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, sr * dur, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * t), 2) * (1 - t * 0.6);
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(900, ctx.currentTime);
      bp.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + dur);
      const g = ctx.createGain(); g.gain.value = 0.22;
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start();
    } catch { /* audio unavailable */ }
  };
}
