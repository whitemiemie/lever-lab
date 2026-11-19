/* Lever Lab: the page. Draws the chamber and the rats, runs the guided tour and the three experiments,
   and keeps score. The rats' behaviour lives in rat.js; this file shows it and passes on your taps. */
(function () {
  'use strict';
  const { Rat, Session, GEOM, SAYS, LADDER, NEED } = window.LeverLab;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const NAME = 'Biscuit';
  const LIMIT = 30;           // pellets before Biscuit is full
  const LAPSE2 = 5, LAPSE3 = 4; // time-lapse in parts 2 and 3
  const RUN = 45;             // seconds of lab time per schedule run
  const KINDS = ['CRF', 'FR', 'VR', 'FI', 'VI'];
  const NICE = {
    turn: 'turning to the lever', approach: 'walking to the lever', rearLever: 'rearing up at the lever',
    press: 'pressing the lever', wander: 'wandering', sniff: 'sniffing', groom: 'grooming',
    spin: 'spinning', rear: 'rearing up away from the lever', eat: 'eating'
  };
  const RULES = {
    CRF: { name: 'CRF', box: 'A', plain: 'Every press pays.',
      shape: '<b>An even climb, a tick on every step.</b> Quick to learn, and the quickest to give up when the food stops.', ex: 'Like a vending machine: it works every time, until it doesn\'t.',
      why: 'Food every time keeps her steady, but she stops to eat after every press.' },
    FR: { name: 'FR 5', box: 'B', plain: 'Every 5th press pays.',
      shape: '<b>Pause, then sprint.</b> After each pellet the rat takes a break, then fires off five fast presses. The line looks like stairs.', ex: 'Like piecework: paid for every five items you make.',
      why: 'She sprints through each block of five to reach the pellet.' },
    VR: { name: 'VR 5', box: 'C', plain: 'On average every 5th press pays, but nobody knows which one.',
      shape: '<b>The steepest line, hardly a pause.</b> Any press might be the winner, so she keeps going.', ex: 'Like a slot machine.',
      why: 'Any press might be the winner, so she barely stops. It\'s the slot-machine rule, and the reason they\'re so hard to walk away from.' },
    FI: { name: 'FI 10 s', box: 'D', plain: 'The first press after 10 seconds pays.',
      shape: '<b>A scallop.</b> Almost nothing right after a pellet, then faster and faster as the 10 seconds run out. Early presses earn nothing.', ex: 'Like studying only as a fixed exam date gets close.',
      why: 'Pressing early earns nothing, so she saves her effort for the end of each 10 seconds.' },
    VI: { name: 'VI 10 s', box: 'E', plain: 'The first press after about 10 seconds pays; the wait changes every time.',
      shape: '<b>Slow but steady.</b> Food could be ready at any moment, so she checks at an even pace.', ex: 'Like checking your phone for messages.',
      why: 'Food could be ready at any moment, so she checks at a calm, even pace.' }
  };
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const fmt = sec => { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

  function freshShape(demo) {
    return { started: false, clock: 0, step: 0, prog: [0, 0, 0, 0], pellets: 0, since: 0, cue: true, cueOn: false, cued: null,
      assist: false, demo: !!demo, autoFed: null, off: {}, shaped: false, full: false, time: 0, taught: {}, showOffered: false };
  }
  const S = {
    screen: 'intro', sound: true, mark: null, tourI: 0,
    rat: new Rat(), sh: freshShape(false),
    five: null, watch: 2, run: 'idle', quiz: null,
    extRat: null, extIdle: null, ext: null, recover: null, extPhase: 'guess', guess: null, offSaid: false,
    records: []
  };

  /* ================================================================ sound (synthesised, no files) */
  let AC = null, lastLever = 0;
  function ac() {
    if (!S.sound) return null;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { return null; }
    return AC;
  }
  function tone(type, f0, f1, dur, vol, when) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, when) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0), n = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start(t);
  }
  const sfx = {
    click() { noise(0.035, 0.9, 3000, 1.8); tone('square', 1500, 700, 0.035, 0.05); },           // feeder solenoid
    tink(d) { tone('sine', 2900, 2500, 0.1, 0.09, d || 0.3); tone('sine', 3700, 3500, 0.06, 0.04, (d || 0.3) + 0.03); },
    lever() {
      const now = performance.now(); if (now - lastLever < 90) return; lastLever = now;
      noise(0.025, 0.5, 1300, 1.4); tone('triangle', 240, 140, 0.05, 0.07);
    },
    off() { tone('square', 170, 80, 0.14, 0.06); noise(0.06, 0.5, 600, 1); },
    good() { tone('sine', 660, 660, 0.1, 0.05); tone('sine', 990, 990, 0.16, 0.05, 0.1); },
    yay() { [523, 659, 784, 1046].forEach((f, i) => tone('sine', f, f, 0.16, 0.05, i * 0.09)); }
  };

  /* ================================================================ the chamber picture */
  const W = GEOM.W, H = GEOM.H, FLOOR = GEOM.FLOOR;
  const box = $('#box'), bctx = box.getContext('2d');
  const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
  const g = scene.getContext('2d');
  const back = document.createElement('canvas'); back.width = W; back.height = H;
  function px(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  (function paintBack() {
    const c = back.getContext('2d');
    px(c, '#56626c', 0, 0, W, H);
    for (let x = 44; x < 176; x += 44) px(c, '#4f5a64', x, 8, 1, FLOOR - 8);
    for (let y = 8; y < FLOOR; y++) for (let x = 9; x < 176; x++) {       // the house light's pool, dithered
      const dx = (x - 168) / 110, dy = (y - 12) / 92, d = dx * dx + dy * dy;
      if (d < 0.22 || (d < 0.42 && (x + y) % 2 === 0)) px(c, '#5e6b75', x, y, 1, 1);
      if (d < 0.07 || (d < 0.14 && (x + y) % 2 === 0)) px(c, '#67747e', x, y, 1, 1);
    }
    px(c, '#2c333a', 0, 0, W, 7); px(c, '#3b444c', 0, 7, W, 1);              // ceiling
    px(c, '#3b444c', 0, 7, 8, FLOOR - 7); px(c, '#47515a', 8, 7, 1, FLOOR - 7); // left wall
    px(c, '#1d2226', 0, FLOOR, W, H - FLOOR);                                 // waste tray under the grid floor
    for (let x = 9; x < 176; x += 5) { px(c, '#adb6bc', x, FLOOR, 3, 1); px(c, '#828c93', x, FLOOR + 1, 3, 1); px(c, '#5d676f', x, FLOOR + 2, 3, 1); }
    px(c, '#3c454d', 0, FLOOR + 7, W, 1); px(c, '#272d32', 0, FLOOR + 8, W, H - FLOOR - 8);
    for (let x = 6; x < W; x += 14) px(c, '#30373d', x, FLOOR + 11, 7, 1);
    px(c, '#b3bcc2', 176, 7, 16, FLOOR - 4);                                   // front panel: brushed aluminium
    px(c, '#8a949b', 176, 7, 1, FLOOR - 4); px(c, '#d2d9dd', 177, 7, 1, FLOOR - 4);
    for (let y = 9; y < FLOOR; y += 3) px(c, '#aab3b9', 179, y, 12, 1);
    [[187, 11], [187, 62], [187, 100]].forEach(p => { px(c, '#7c868e', p[0], p[1], 2, 2); px(c, '#e6ebee', p[0], p[1], 1, 1); });
    px(c, '#3a4249', 180, 28, 6, 64); px(c, '#232a30', 181, 29, 4, 62);       // pellet chute window
    px(c, '#2a3137', 175, 76, 2, 9);                                           // lever slot
    px(c, '#8e6a26', 165, 91, 12, 1); px(c, '#1b2024', 166, 92, 10, FLOOR - 92); px(c, '#8e6a26', 165, 92, 1, FLOOR - 92); // food cup
    px(c, '#6d777f', 167, 8, 10, 7); px(c, '#3b434a', 168, 9, 8, 5);         // house light housing
  })();

  // the rat is drawn smooth into a small sprite, then snapped to a palette and outlined, so it reads as pixel art
  const RW = 72, RH = 48, OX = 30, OY = 44;
  const rc = document.createElement('canvas'); rc.width = RW; rc.height = RH;
  const r2 = rc.getContext('2d', { willReadFrequently: true });
  const PAL = [[245, 241, 233], [210, 202, 189], [229, 152, 160], [176, 34, 48]];
  const FUR = '#f5f1e9', SHADE = '#d2cabd', PINK = '#e598a0', LINE = [40, 37, 50];
  function ell(x, y, rx, ry, rot, col) { r2.fillStyle = col; r2.beginPath(); r2.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); r2.fill(); }
  function seg(x1, y1, x2, y2, w, col) { r2.strokeStyle = col; r2.lineWidth = w; r2.lineCap = 'round'; r2.beginPath(); r2.moveTo(x1, y1); r2.lineTo(x2, y2); r2.stroke(); }

  function paintRat(P, time) {
    r2.setTransform(1, 0, 0, 1, 0, 0); r2.clearRect(0, 0, RW, RH); r2.translate(OX, OY);
    const rear = P.rear, groom = P.groom * (1 - rear), crouch = P.crouch, lift = Math.max(rear, groom);
    const a = -1.12 * rear - 0.78 * groom + 0.06 * crouch, ca = Math.cos(a), sa = Math.sin(a);
    const Hx = 0, Hy = -6 + crouch * 0.3;
    const at = (d, n) => [Hx + ca * d - sa * n, Hy + sa * d + ca * n];
    const h = a * 0.5 + P.head + 0.55 * groom + (P.sniff ? Math.sin(time * 26) * 0.05 : 0);
    const ch = Math.cos(h), sh = Math.sin(h);
    const N = at(16, 0), Hc = [N[0] + ch * 3, N[1] + sh * 3];
    const hd = (d, n) => [Hc[0] + ch * d - sh * n, Hc[1] + sh * d + ch * n];
    const w1 = Math.sin(P.leg) * 1.6 * P.walk, w2 = Math.sin(P.leg + Math.PI) * 1.6 * P.walk;
    const R = at(-6, 1), wave = Math.sin(time * 2.2) * 1.2;                     // tail along the floor
    r2.strokeStyle = PINK; r2.lineWidth = 1.7; r2.lineCap = 'round';
    r2.beginPath(); r2.moveTo(R[0], R[1]); r2.quadraticCurveTo(-14, 1.5, -24, -1.5 + wave); r2.stroke();
    const th = at(1, 3);                                                        // hind leg
    seg(th[0], th[1], Hx + 3 + w1, -0.8, 2.6, SHADE); seg(Hx + 2 + w1, -0.6, Hx + 6.5 + w1, -0.6, 1.5, PINK);
    // front legs: on the floor when standing, at the chest when up, at the face when grooming, on the lever when pressing
    const sh0 = at(13, 3.2), stand = [at(14, 0)[0] + 1 + w2, -0.8];
    const upPaw = at(17.5 + P.paw * 2.5, 4.2 + P.paw * 1.5), facePaw = hd(3.4, 2.6 + Math.sin(time * 15) * 0.7);
    const L = lift || 1, lifted = [upPaw[0] * (rear / L) + facePaw[0] * (groom / L), upPaw[1] * (rear / L) + facePaw[1] * (groom / L)];
    const paw = [stand[0] + (lifted[0] - stand[0]) * lift, stand[1] + (lifted[1] - stand[1]) * lift];
    seg(sh0[0], sh0[1], paw[0], paw[1], 2.2, SHADE);
    r2.fillStyle = PINK; r2.fillRect(Math.round(paw[0] - 1), Math.round(paw[1] - 0.6), 2.4, 1.4);
    const body = (dy, col) => {                       // a shade layer one pixel low, then fur: the belly keeps a darker rim
      const rp = at(-1, 0), bc = at(8, 0), cs = at(14, 0.6);
      ell(rp[0], rp[1] + dy, 6.3, 6.1, 0, col); ell(bc[0], bc[1] + dy, 9.6, 5.7, a, col); ell(cs[0], cs[1] + dy, 4.7, 4.5, a, col);
      ell(Hc[0], Hc[1] + dy, 5.5, 4.1, h, col); const sn = hd(4.6, 0.7); ell(sn[0], sn[1] + dy, 3.6, 2.6, h, col);
    };
    body(1, SHADE); body(0, FUR);
    const ear = hd(-1.7, -3.9); ell(ear[0], ear[1], 2.6, 2.6, 0, SHADE); ell(ear[0] + 0.2, ear[1] - 0.3, 2.3, 2.3, 0, FUR);
    const ein = hd(-1.4, -3.7); ell(ein[0], ein[1], 1.3, 1.3, 0, PINK);
    // snap to the palette, drop soft edges, add a one-pixel outline
    const img = r2.getImageData(0, 0, RW, RH), d = img.data, solid = new Uint8Array(RW * RH);
    for (let i = 0, p = 0; p < RW * RH; p++, i += 4) {
      if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
      let best = 0, bd = 1e9;
      for (let k = 0; k < PAL.length; k++) {
        const dr = d[i] - PAL[k][0], dg = d[i + 1] - PAL[k][1], db = d[i + 2] - PAL[k][2], dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; best = k; }
      }
      d[i] = PAL[best][0]; d[i + 1] = PAL[best][1]; d[i + 2] = PAL[best][2]; d[i + 3] = 255; solid[p] = 1;
    }
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const p = y * RW + x; if (solid[p]) continue;
      if ((x > 0 && solid[p - 1]) || (x < RW - 1 && solid[p + 1]) || (y > 0 && solid[p - RW]) || (y < RH - 1 && solid[p + RW])) {
        const i = p * 4; d[i] = LINE[0]; d[i + 1] = LINE[1]; d[i + 2] = LINE[2]; d[i + 3] = 255;
      }
    }
    const dot = (pt, col) => {
      const x = Math.round(pt[0] + OX), y = Math.round(pt[1] + OY); if (x < 0 || y < 0 || x >= RW || y >= RH) return;
      const i = (y * RW + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    };
    dot(hd(1.4, -1.2), PAL[3]);                                                // red eye (an albino lab rat)
    dot(hd(8.1 + (P.sniff && Math.sin(time * 30) > 0 ? 0.6 : 0), 0.9), PAL[2]); // nose
    r2.putImageData(img, 0, 0);
  }

  const drops = [];          // pellets falling down the chute
  function outline(x, y, w, h, on) {        // a blinking marker for the tour
    if (!on) return;
    g.fillStyle = '#ffd75e';
    g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  }
  function drawScene(rat, time) {
    g.drawImage(back, 0, 0);
    px(g, '#ffefbf', 169, 10, 6, 3); px(g, '#fff8de', 170, 10, 4, 1);         // house light on
    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i]; const y = 30 + Math.min(1, p.t / 0.32) * 60;
      if (p.t < 0.32) px(g, '#c08447', 182, Math.round(y), 2, 2);
    }
    const inCup = (rat.mode === 'free' && rat.pellets > 0 && !drops.some(p => p.t < 0.32)) || (rat.mode === 'box' && rat.boxPose === 'eat' && rat.pose.crouch < 0.6);
    if (inCup) { px(g, '#c08447', 169, 101, 2, 2); px(g, '#8a5a2a', 170, 102, 1, 1); }
    const P = rat.pose;
    paintRat(P, time);
    const xi = Math.round(rat.x);
    let sx = rat.facing;
    if (P.spin > 0) { const c = Math.cos(P.spin * Math.PI * 2); sx = rat.facing * (Math.abs(c) < 0.3 ? 0.3 * (c < 0 ? -1 : 1) : c); }
    g.save(); g.translate(xi, FLOOR - OY); g.scale(sx, 1); g.drawImage(rc, -OX, 0); g.restore();
    const Lv = rat.lever;                                                       // the lever, tip drops when pressed
    for (let i = 0; i <= 15; i++) {
      const x = 176 - i, y = 79 + Math.round(Lv * 3 * i / 15);
      px(g, '#ecc56a', x, y, 1, 1); px(g, '#c3922f', x, y + 1, 1, 1); px(g, '#7a5513', x, y + 2, 1, 1);
    }
    px(g, '#e9eef1', 161, 79 + Math.round(Lv * 3), 1, 1);
    g.fillStyle = 'rgba(255,255,255,0.07)';                                     // front Plexiglas reflections
    for (let i = 0; i < 40; i++) { g.fillRect(14 + i, 10 + i, 2, 1); g.fillRect(22 + i, 10 + i, 1, 1); }
    if (S.screen === 'tour' && S.mark) {
      const on = Math.floor(time * 2.5) % 2 === 0;
      if (S.mark === 'lever') outline(158, 75, 20, 10, on);
      if (S.mark === 'feeder') { outline(178, 26, 10, 68, on); outline(163, 89, 15, 17, on); }
      if (S.mark === 'rat') { const x0 = rat.facing > 0 ? xi - 28 : xi - 31; outline(x0, FLOOR - 24, 60, 27, on); }
    }
  }

  // the camera: the whole chamber while you shape; a wide, close shot of the lever once the box takes over
  const FULL = { x: 0, y: 0, w: W, h: H }, CLOSE = { x: 60, y: 60, w: 132, h: 55 };
  const view = Object.assign({}, FULL);
  function camFor() { return S.screen === 'sched' || S.screen === 'ext' ? CLOSE : FULL; }
  function fitBox() {
    const dpr = Math.min(3, window.devicePixelRatio || 1), w = Math.round(box.clientWidth * dpr), t = camFor();
    const h = Math.round(w * t.h / t.w);
    if (w > 0 && (box.width !== w || box.height !== h)) { box.width = w; box.height = h; Object.assign(view, t); }
  }
  function blit(rat, dt) {
    const tgt = camFor();
    const k = Math.min(1, (dt || 0) * 4);
    ['x', 'y', 'w', 'h'].forEach(q => { view[q] += (tgt[q] - view[q]) * k; if (Math.abs(tgt[q] - view[q]) < 0.05) view[q] = tgt[q]; });
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(scene, view.x, view.y, view.w, view.h, 0, 0, box.width, box.height);
  }

  /* ================================================================ cumulative records */
  const rec = $('#rec');
  const RESET = 45;   // the pen climbs this many presses, then snaps back to the bottom (as real recorders did)
  function paper(cv, small) {
    const dpr = Math.min(3, window.devicePixelRatio || 1), cw = cv.clientWidth, chh = cv.clientHeight;
    if (!cw || !chh) return null;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#fbf8ef'; c.fillRect(0, 0, cw, chh);
    const step = small ? 6 : 10;
    for (let x = 0; x <= cw; x += step) { c.fillStyle = (x / step) % 5 === 0 ? '#cfdccb' : '#e6ede2'; c.fillRect(Math.round(x), 0, 1, chh); }
    for (let y = chh; y >= 0; y -= step) { c.fillStyle = ((chh - y) / step) % 5 === 0 ? '#cfdccb' : '#e6ede2'; c.fillRect(0, Math.round(y), cw, 1); }
    return { c, cw, chh };
  }
  // one pen trace with red ticks where food came
  function pen(c, s, dur, x0, sx, bottom, sy, reset, small, col, lw, noPips) {
    const end = Math.min(s.t, dur);
    c.strokeStyle = col || '#23408e'; c.lineWidth = lw || (small ? 1.2 : 1.8); c.lineJoin = 'round'; c.beginPath();
    let lvl = 0, X = x0, Y = bottom, mi = 0; const pips = [];
    c.moveTo(X, Y);
    for (let i = 1; i < s.points.length; i++) {
      const t = s.points[i][0], n = s.points[i][1];
      if (t > dur) break;
      X = x0 + t * sx; c.lineTo(X, Y);
      lvl++; Y = bottom - lvl * sy; c.lineTo(X, Y);
      while (mi < s.marks.length && s.marks[mi][1] < n) mi++;
      if (mi < s.marks.length && s.marks[mi][1] === n) pips.push([X, Y]);
      if (lvl >= reset) { lvl = 0; Y = bottom; c.lineTo(X, Y); }
    }
    c.lineTo(x0 + end * sx, Y); c.stroke();
    if (!noPips) {
      c.strokeStyle = '#c2412d'; c.lineWidth = small ? 1 : 1.6; c.beginPath();
      const pl = small ? 2.5 : 5;
      pips.forEach(p => { c.moveTo(p[0], p[1]); c.lineTo(p[0] + pl, p[1] + pl); });
      c.stroke();
    }
    if (!small && s.t < dur && !noPips) { c.fillStyle = col || '#23408e'; c.beginPath(); c.moveTo(x0 + end * sx, Y); c.lineTo(x0 + end * sx + 7, Y - 4); c.lineTo(x0 + end * sx + 7, Y + 4); c.fill(); }
  }
  function timeScale(c, cw, chh, padR, sx) {
    const L = 10 * sx; c.fillStyle = '#4b5260';
    c.fillRect(cw - padR - L, chh - 8, L, 1.5); c.fillRect(cw - padR - L, chh - 11, 1, 6); c.fillRect(cw - padR - 1, chh - 11, 1, 6);
    c.font = '400 10px "Plex Mono", ui-monospace, monospace'; c.fillText('10 s', cw - padR - L - 28, chh - 5);
  }
  // segments side by side (extinction: day 1, day 2) or a small thumbnail
  function drawRecord(cv, segs, o) {
    o = o || {};
    const P = paper(cv, o.small); if (!P || !segs.length) return;
    const { c, cw, chh } = P;
    const pad = o.small ? { l: 3, r: 3, t: 4, b: 4 } : { l: 8, r: 14, t: 22, b: 20 }, gap = o.small ? 6 : 22;
    const total = segs.reduce((s, x) => s + x.dur, 0);
    const sx = (cw - pad.l - pad.r - gap * (segs.length - 1)) / total, bottom = chh - pad.b, sy = (bottom - pad.t) / RESET;
    let x0 = pad.l;
    segs.forEach(sg => {
      const s = sg.s;
      s.notes.forEach(n => {
        if (n[1] !== 'feeder off') return;
        const x = x0 + n[0] * sx; c.fillStyle = '#c2412d';
        for (let y = pad.t - 4; y < bottom; y += 6) c.fillRect(Math.round(x), y, 1, 3);
        if (!o.small) { c.font = '600 11px "Plex Mono", ui-monospace, monospace'; c.fillText('feeder off', x + 4, pad.t + 6); }
      });
      pen(c, s, sg.dur, x0, sx, bottom, sy, RESET, o.small);
      if (!o.small) {
        c.fillStyle = '#1e2430'; c.font = '600 11px "Plex Mono", ui-monospace, monospace'; c.fillText(sg.label, x0, 13);
        const lw = c.measureText(sg.label).width;
        c.fillStyle = '#6e7380'; c.font = '400 10.5px "Plex Mono", ui-monospace, monospace';
        const txt = s.n + ' presses', tw = c.measureText(txt).width;
        if (lw + 10 + tw <= sg.dur * sx) c.fillText(txt, x0 + lw + 10, 13);
      }
      x0 += sg.dur * sx + gap;
    });
    if (!o.small) timeScale(c, cw, chh, pad.r, sx);
  }
  // part 2: five pens racing on one sheet; the box you watch is drawn bold with its food ticks
  const COL = { CRF: '#8a8f99', FR: '#2f6b4f', VR: '#23408e', FI: '#b4603d', VI: '#7a4fa8' };
  const RACE = { padL: 30, padR: 62, top: 12, bot: 22, max: 70 };
  let raceGeo = null;
  function drawRace(cv, five, watch) {
    const P = paper(cv); if (!P) return;
    const { c, cw, chh } = P, sx = (cw - RACE.padL - RACE.padR) / RUN, bottom = chh - RACE.bot, sy = (bottom - RACE.top) / RACE.max;
    raceGeo = { sx: sx, bottom: bottom, sy: sy };
    c.fillStyle = '#6e7380'; c.font = '400 10px "Plex Mono", ui-monospace, monospace';
    [0, 35, 70].forEach(v => c.fillText(String(v), 4, bottom - v * sy + 3));
    c.save(); c.translate(11, RACE.top + 40); c.rotate(-Math.PI / 2); c.fillText('presses', -38, 0); c.restore();
    const order = five.map((f, i) => i).filter(i => i !== watch).concat([watch]);
    const ends = [];
    order.forEach(i => {
      const f = five[i]; if (!f.s) return;
      const me = i === watch;
      c.globalAlpha = me ? 1 : 0.8;
      pen(c, f.s, RUN, RACE.padL, sx, bottom, sy, 999, false, COL[f.kind], me ? 2.6 : 1.5, !me);
      c.globalAlpha = 1;
      ends.push({ i: i, x: RACE.padL + Math.min(f.s.t, RUN) * sx, y: bottom - Math.min(f.s.n, RACE.max) * sy });
    });
    if (!ends.length) {
      c.fillStyle = '#6e7380'; c.font = '400 12px "Plex Sans", ui-sans-serif, sans-serif';
      c.fillText('Five pens, ready to race.', RACE.padL + 10, bottom - 40);
    }
    // name tags at the end of each line, nudged apart so they never overlap
    ends.sort((p, q) => p.y - q.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    ends.forEach(e => {
      const f = five[e.i], me = e.i === watch;
      c.fillStyle = COL[f.kind]; c.font = (me ? '600 ' : '400 ') + '11px "Plex Mono", ui-monospace, monospace';
      c.fillText(RULES[f.kind].name, e.x + 6, Math.min(bottom, e.y + 4));
    });
    timeScale(c, cw, chh, RACE.padR, sx);
  }
  rec.addEventListener('click', e => {        // tap a line to watch that rat
    if (S.screen !== 'sched' || !raceGeo || !S.five || !S.five[0].s) return;
    const r = rec.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const t = Math.max(0, Math.min(RUN, (x - RACE.padL) / raceGeo.sx));
    let best = -1, bd = 1e9;
    S.five.forEach((f, i) => {
      let n = 0; for (const p of f.s.points) { if (p[0] <= t) n = p[1]; else break; }
      const d = Math.abs(raceGeo.bottom - n * raceGeo.sy - y); if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0 && bd < 40) selectBox(best);
  });
  function thumb(where, segs, label) {
    const f = document.createElement('figure'), cv = document.createElement('canvas'), cp = document.createElement('figcaption');
    cp.textContent = label; cv.setAttribute('aria-label', 'Cumulative record, ' + label);
    f.append(cv, cp); where.append(f);
    requestAnimationFrame(() => drawRecord(cv, segs, { small: true }));
  }

  /* ================================================================ the guide */
  const coachEl = $('#coach'), coachTxt = $('#coachText'), coachAct = $('#coachActions'), coachStep = $('#coachStep');
  function coach(html, actions, mood, step, opts) {
    coachEl.hidden = false;
    coachEl.className = 'coach' + (mood ? ' ' + mood : '');
    coachTxt.innerHTML = html;
    coachStep.innerHTML = step || '';
    coachAct.innerHTML = '';
    coachAct.classList.toggle('opts', !!opts);
    (actions || []).forEach(a => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = a.cls || ('btn' + (a.primary ? ' primary' : ''));
      b.innerHTML = a.label; if (a.id) b.id = a.id; if (a.disabled) b.disabled = true;
      b.addEventListener('click', a.go); coachAct.append(b);
    });
  }
  const status = $('#status'), toastEl = $('#toast');
  let toastTimer = 0, lastSaid = '';
  function say(text) { if (text && text !== lastSaid) { status.textContent = text; lastSaid = text; } }
  function toast(html, kind) {
    toastEl.innerHTML = html; toastEl.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.className = 'toast ' + (kind || ''); }, 1800);
  }

  /* ================================================================ screens and navigation */
  const screens = { intro: $('#sIntro'), tour: $('#sTour'), shape: $('#sShape'), sched: $('#sSched'), ext: $('#sExt'), report: $('#sReport') };
  let tourTimer = 0;
  function show(name) {
    clearInterval(tourTimer);
    S.screen = name;
    Object.keys(screens).forEach(k => { screens[k].hidden = k !== name; });
    const nav = { shape: 'shape', tour: 'shape', sched: 'sched', ext: 'ext', report: 'report' }[name];
    $('#steps').hidden = name === 'intro';
    $$('#steps button').forEach(b => {
      const k = b.dataset.go, done = (k === 'shape' && S.sh.shaped) || (k === 'sched' && S.run === 'done') || (k === 'ext' && S.extPhase === 'done2');
      b.classList.toggle('on', k === nav); b.classList.toggle('done', done);
      if (k === nav) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    const boxy = name === 'sched' || name === 'ext';
    $('#recorder').hidden = !boxy;
    $('#recorder').classList.toggle('tall', name === 'sched');
    $('#speed').hidden = !boxy;
    $('#speed').textContent = 'Time-lapse ×' + (name === 'sched' ? LAPSE2 : LAPSE3);
    $('#chamber').hidden = name === 'report';
    coachEl.hidden = name === 'intro' || name === 'report';
    status.setAttribute('aria-live', name === 'shape' || name === 'tour' ? 'polite' : 'off');
    $('#btnFeed').classList.remove('cue');
    plate();
    window.scrollTo(0, 0);
    fitBox();
  }
  function plate() {
    const p = $('#plate');
    if (S.screen === 'sched' && S.five) { const k = S.five[S.watch].kind; p.textContent = 'Box ' + RULES[k].box + ' · ' + RULES[k].name; }
    else if (S.screen === 'ext') p.textContent = NAME + ' · feeder ' + ((S.ext && S.ext.t >= S.ext.offAt) || S.recover ? 'off' : 'on');
    else p.textContent = 'Operant chamber · ' + NAME;
  }
  function go(name) {
    if (name === 'shape') goShape();
    else if (name === 'sched') enterSched();
    else if (name === 'ext') enterExt();
    else if (name === 'report') report();
    else if (name === 'tour') startTour();
  }
  $$('#steps button').forEach(b => { b.onclick = () => { ac(); go(b.dataset.go); }; });

  /* ================================================================ the guided tour */
  const TOUR = [
    { kick: 'Harvard, the 1930s', html: '<p>A young psychologist called <b>B.&nbsp;F. Skinner</b> had a big question: why do we repeat some actions and drop others?</p><p>His hunch: it all depends on what happens <i>next</i>.</p>' },
    { kick: 'The big idea', html: '<p>He called it <b>operant conditioning</b>. An action followed by something good gets repeated. An action followed by nothing fades away.</p><p>To test it, he built a box. One just like this.</p>' },
    { kick: 'Inside the box · the lever', mark: 'lever', html: '<p>This is <b>the lever</b> (flashing yellow). To a rat it\'s just a strange bit of metal on the wall.</p>' },
    { kick: 'Inside the box · the feeder', mark: 'feeder', feeder: true, html: '<p>This is <b>the feeder</b>. Each tap of FEED drops one pellet down the chute into the food cup, with a loud <b>click</b>. Go on, try it.</p>' },
    { kick: 'Meet ' + NAME, mark: 'rat', watch: 5, html: '<p>And this is <b>' + NAME + '</b>. Hungry, curious, and she has never touched a lever in her life.</p><p>Watch her for a few seconds. What does she get up to?</p>' },
    { kick: 'The problem', html: '<p>Wandering, sniffing, grooming… but pressing the lever? <b>Almost never.</b> Wait for that and you\'ll be here all night.</p><p>Skinner\'s trick was <b>shaping</b>: reward any small step in the right direction, then ask for a little more.</p><ol class="mini-ladder"><li>turn</li><li>walk over</li><li>rear up</li><li>press</li></ol>' },
    { kick: 'Your mission', html: '<p>Get ' + NAME + ' pressing the lever <b>all on her own</b>. You can\'t talk to her. All you have is the FEED button.</p><p>One rule: <b>feed her the instant she does the step.</b> Too slow, and you reward whatever she\'s doing by then. I\'ll be right here to help.</p>' }
  ];
  function startTour() { show('tour'); tourGo(0); }
  function tourGo(i) {
    clearInterval(tourTimer);
    S.tourI = i; const t = TOUR[i]; S.mark = t.mark || null;
    const acts = [];
    if (i > 0) acts.push({ label: 'Back', cls: 'btn back', go: () => tourGo(i - 1) });
    if (t.feeder) acts.push({ label: 'Tap the feeder', go: tourFeed });
    if (i < TOUR.length - 1) acts.push({ label: t.watch ? 'Keep watching… ' + t.watch : 'Next', primary: true, id: 'tourNext', disabled: !!t.watch, go: () => tourGo(i + 1) });
    else acts.push({ label: 'Start training ' + NAME, primary: true, go: () => startShape(false) });
    coach('<p class="ck">' + t.kick + '</p>' + t.html, acts, '', (i + 1) + ' / ' + TOUR.length + (i < TOUR.length - 1 ? ' · <button type="button" class="linkbtn" id="skipTour">skip</button>' : ''));
    const sk = $('#skipTour'); if (sk) sk.onclick = () => startShape(false);
    if (t.watch) {
      let n = t.watch;
      tourTimer = setInterval(() => {
        const b = $('#tourNext'); if (!b) return clearInterval(tourTimer);
        n--; if (n > 0) b.textContent = 'Keep watching… ' + n; else { b.textContent = 'Next'; b.disabled = false; clearInterval(tourTimer); }
      }, 1000);
    }
  }
  function tourFeed() {
    ac(); sfx.click(); S.rat.feed();
    if (!S.tourFed) {
      S.tourFed = true;
      coachTxt.insertAdjacentHTML('beforeend', '<p>Hear that click? ' + NAME + ' already knows it means food. That click is your secret weapon: it marks the <b>exact moment</b> she did something right.</p>');
    }
  }

  /* ================================================================ part 1: shaping */
  const STEP_TXT = [
    '<p><b>Step 1: the turn.</b> Wait until ' + NAME + ' faces the lever (to the right →), then tap FEED straight away.</p>',
    '<p><b>Step 2: walk over.</b> Stop feeding turns now. Wait until she walks all the way up to the lever.</p>',
    '<p><b>Step 3: rear up.</b> Feed her only when she stands up on her hind legs <i>at the lever</i>. Twice.</p>',
    '<p><b>Step 4: the press!</b> Her paws are right by the lever. Feed the instant you hear it clack. Three presses to go.</p>'
  ];
  const PRAISE = [
    '<p><b>Nice!</b> Hear that click? Turning to the lever just got more likely. Watch its green bar grow in the lab notes below.</p>',
    '<p><b>She\'s getting the idea.</b> Walking over is now a habit. Time to raise the bar again.</p>',
    '<p><b>So close!</b> She\'s standing up at the lever, paws right next to it.</p>'
  ];
  const BASE_H = new Rat(() => 0.5).habits();
  function renderLadder() {
    const sh = S.sh;
    $$('#ladder li').forEach((li, i) => {
      li.classList.toggle('done', i < sh.step); li.classList.toggle('now', i === sh.step && !sh.shaped);
      const p = li.querySelector('.pips'); p.innerHTML = '';
      for (let k = 0; k < NEED[i]; k++) { const d = document.createElement('i'); if (k < Math.min(sh.prog[i], NEED[i]) || i < sh.step) d.className = 'on'; p.append(d); }
    });
  }
  function renderBars() {
    const hb = S.rat.habits();
    $$('#bars dd').forEach(dd => {
      const k = dd.dataset.h; dd.firstElementChild.style.width = Math.round(hb[k] * 100) + '%';
      const sup = (k === 'wander' || k === 'groom' || k === 'spin') && hb[k] > BASE_H[k] + 0.18;
      dd.classList.toggle('super', sup);
      const dt = dd.previousElementSibling; let tag = dt.querySelector('small');
      if (sup && !tag) { tag = document.createElement('small'); tag.textContent = 'superstition'; dt.append(tag); }
      if (!sup && tag) tag.remove();
    });
  }
  function renderHunger() {
    const left = Math.max(0, LIMIT - S.sh.pellets);
    $('#hungerN').textContent = left; $('#hunger').style.width = (left / LIMIT * 100) + '%';
  }

  function startShape(demo) {
    const old = S.rat; S.rat = new Rat(); S.rat.x = old.x; S.rat.facing = old.facing;
    S.sh = freshShape(demo); S.sh.started = true; S.sh.cue = !demo;
    show('shape');
    $('#feedbar').hidden = false; $('#btnFeed').disabled = !!demo;
    renderLadder(); renderBars(); renderHunger();
    shapeSay();
  }
  function goShape() {
    if (!S.sh.started) return startShape(false);
    show('shape'); renderLadder(); renderBars(); renderHunger();
    $('#feedbar').hidden = S.sh.shaped || S.sh.full;
    shapeSay();
  }
  function shapeSay(prefix, mood) {
    const sh = S.sh;
    if (sh.shaped) return coachDone();
    if (sh.full) return coachFull();
    if (sh.demo) return coach('<p><b>Demo.</b> Watch when the pellets come: each one lands the instant ' + NAME + ' does the next step. That\'s the timing to aim for.</p>', [{ label: 'Stop the demo and try myself', cls: 'btn back', go: () => startShape(false) }], '', 'Demo · step ' + (sh.step + 1) + ' of 4');
    let html = (prefix || '') + STEP_TXT[sh.step];
    if (sh.cue && !prefix) html += '<p class="small">I\'ll shout <b>NOW</b> when she does it.</p>';
    const acts = sh.showOffered ? [{ label: 'Show me how', go: showMe }] : [];
    coach(html, acts, mood || '', 'Part 1 · step ' + (sh.step + 1) + ' of 4');
  }
  function coachDone() {
    const sh = S.sh, off = Object.keys(sh.off);
    coach('<p><b>You did it!</b> ' + NAME + ' presses the lever all on her own' + (sh.demo ? ' (with the demo\'s timing)' : '') + ', after ' + fmt(sh.time) + ' and ' + sh.pellets + ' pellets.</p>' +
      '<p>That\'s <b>shaping</b>: rewarding closer and closer steps toward a goal. Animal trainers still use it to teach dogs, dolphins and parrots their tricks.</p>' +
      (off.length ? '<p class="small">Along the way you also fed ' + off.map(k => NICE[k]).join(', ') + ', so those moves grew too.</p>' : ''),
      [{ label: 'Next: when should food come? →', primary: true, go: () => go('sched') }, { label: 'Train a new rat', cls: 'btn back', go: () => startShape(false) }], 'yay', 'Part 1 done');
  }
  function coachFull() {
    coach('<p><b>' + NAME + ' is full!</b> A well-fed rat stops working for food. Shaping works with a few well-timed pellets, not lots of random ones.</p>',
      [{ label: 'New hungry rat', primary: true, go: () => startShape(false) }, { label: 'Watch a demo', go: () => startShape(true) }], 'oops', 'Out of pellets');
  }
  function showMe() { S.sh.assist = true; coach('<p>Watch closely: the next pellet will land at exactly the right moment.</p>', [], '', 'Part 1 · step ' + (S.sh.step + 1) + ' of 4'); }

  function feed(by) {
    const sh = S.sh;
    if (S.screen !== 'shape' || sh.shaped || sh.full) return;
    sfx.click();
    const btn = $('#btnFeed'); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 120); btn.classList.remove('cue');
    try { if (by === 'you' && navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    sh.pellets++; renderHunger();
    sh.cueOn = false;
    const r = S.rat.feed();
    judge(r, by);
    renderBars();
    if (!sh.shaped && sh.pellets >= LIMIT) {
      sh.full = true; btn.disabled = true;
      setTimeout(() => { if (S.screen === 'shape' && !sh.shaped && S.sh === sh) { $('#feedbar').hidden = true; shapeSay(); } }, 1200);
    }
  }
  function judge(r, by) {
    const sh = S.sh;
    if (r.busy) { toast('Still eating. Save it for her next move.', 'warn'); return; }
    const j = LADDER.indexOf(r.label);
    if (j >= sh.step) {
      const before = sh.step;
      sh.prog[sh.step]++;                        // a move past the current step counts for the current step
      if (sh.prog[sh.step] >= NEED[sh.step]) sh.step++;
      sh.since = 0; sh.showOffered = false;
      toast('✓ ' + cap(NICE[r.label]), 'good');
      renderLadder();
      if (sh.step >= LADDER.length) return shapeDone();
      if (sh.step !== before) { sfx.good(); sh.cue = false; shapeSay((by === 'help' ? '<p><b>There! That was the moment.</b></p>' : '') + PRAISE[before], 'yay'); }
      else shapeSay(by === 'help' ? '<p><b>There!</b> That was the moment. Now you try.</p>' : '<p><b>Yes!</b> ' + cap(NICE[r.label]) + ' just got a bit more likely. Once more.</p>', 'yay');
    } else if (j >= 0) {
      shapeSay('<p><b>That\'s the old step.</b> To shape, you have to raise the bar: only feed <b>' + NICE[LADDER[sh.step]] + '</b> now.</p>', 'oops');
    } else {
      sh.off[r.label] = (sh.off[r.label] || 0) + 1;
      const late = r.prev && LADDER.indexOf(r.prev) >= sh.step && r.prevAgo < 1.5;
      if (late) shapeSay('<p><b>A bit too slow!</b> By the click she\'d moved on to ' + NICE[r.label] + ', so <i>' + NICE[r.label] + '</i> got the credit. Timing is everything.</p>', 'oops');
      else if (!sh.taught.super) { sh.taught.super = true; shapeSay('<p><b>Oops, you fed her while she was ' + NICE[r.label] + '.</b> Now she\'ll do that more often. Skinner saw pigeons pick up odd rituals this way and called it <b>superstitious behaviour</b>.</p>', 'oops'); }
      else shapeSay('<p>That pellet went to <b>' + NICE[r.label] + '</b>. Wait for the step.</p>', 'oops');
    }
  }
  function shapeDone() {
    const sh = S.sh;
    sh.shaped = true; sh.time = sh.clock;
    $('#feedbar').hidden = true; sfx.yay();
    renderLadder(); coachDone(); plate();
    $$('#steps button[data-go="shape"]').forEach(b => b.classList.add('done'));
  }

  function shapeTick(dt) {
    const sh = S.sh, rat = S.rat;
    sh.clock += dt;
    const e = rat.log[rat.log.length - 1], j = LADDER.indexOf(e.label);
    if (sh.shaped) {               // the box now feeds each press, so you can watch the new habit
      if (e.label === 'press' && sh.autoFed !== e && rat.now - e.t0 > 0.15) { sh.autoFed = e; rat.feed(); }
      return;
    }
    if (sh.full) return;
    if ((sh.demo || sh.assist) && e !== sh.autoFed && j >= sh.step && rat.now - e.t0 >= 0.3) {
      sh.autoFed = e; const was = sh.assist; sh.assist = false; feed(was ? 'help' : 'demo'); return;
    }
    if (sh.demo) return;
    sh.since += dt;
    // NOW! cue: on for step 1, and for any step you get stuck on
    const eating = rat.act.name === 'goEat' || rat.act.name === 'eat';
    if (sh.cue && !sh.cueOn && !eating && j >= sh.step && e !== sh.cued) {
      sh.cued = e; sh.cueOn = true;
      $('#btnFeed').classList.add('cue');
      coach('<p><em class="now">NOW!</em> She\'s ' + NICE[e.label] + '. Tap FEED!</p>', [], 'now', 'Part 1 · step ' + (sh.step + 1) + ' of 4');
    } else if (sh.cueOn && e !== sh.cued && !(sh.cued.label === 'press' && rat.now - rat.lastPress < 0.9)) {
      sh.cueOn = false; $('#btnFeed').classList.remove('cue');
      shapeSay('<p>Missed that one. No problem: she\'ll do it again.</p>');
    }
    if (!sh.cue && sh.since > 12) { sh.cue = true; if (!sh.cueOn) shapeSay('<p>Tricky one? I\'ll help.</p>'); }
    if (!sh.showOffered && sh.since > 25 && !sh.cueOn) { sh.showOffered = true; shapeSay('<p>Still waiting? Let me show you the moment once.</p>'); }
  }

  /* ================================================================ part 2: five boxes, five rules */
  function makeFive() { S.five = KINDS.map(k => { const rat = new Rat(); rat.toBox(); return { kind: k, rat: rat, s: null }; }); }
  function enterSched() {
    if (!S.five) makeFive();
    show('sched');
    renderBoxes(); schedCaption();
    if (S.run === 'idle') coach('<p class="ck">Part 2 · Schedules</p><p>In real life, rewards hardly ever come every time. Skinner\'s lab spent years testing <b>rules</b> for when food arrives. They\'re called <b>schedules of reinforcement</b>.</p><p>Here are five trained rats, one rule each. Let\'s run them side by side and see whose pen climbs fastest.</p>',
      [{ label: 'Run all five rats', primary: true, go: runFive }], '', 'Part 2');
    else if (S.run === 'running') coachRunning();
    else afterQuiz(true);
  }
  function coachRunning() {
    coach('<p><b>Running…</b> Each line climbs one step per press, and a red tick means food. <b>Steeper = faster pressing.</b></p><p class="small">Tap a box or a line to watch that rat. Time-lapse ×' + LAPSE2 + '.</p>', [], '', 'Part 2');
  }
  function runFive() {
    ac();
    S.five.forEach(f => { f.rat = new Rat(); f.rat.toBox(); f.s = new Session(f.rat, f.kind); f.s.duration = RUN; });
    S.run = 'running'; S.quiz = null;
    renderBoxes(); schedCaption(); coachRunning();
    $('#chamber').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function finishFive() {
    S.run = 'done'; S.quiz = 'ask';
    S.five.forEach(f => { f.rat.boxPose = 'idle'; });
    S.records = S.records.filter(r => r.kind === 'EXT');
    S.five.forEach(f => S.records.push({ kind: f.kind, label: RULES[f.kind].name, segs: [{ s: f.s, label: RULES[f.kind].name, dur: RUN }] }));
    sfx.good();
    renderBoxes(); schedCaption();
    coach('<p><b>Quick quiz!</b> Which rat pressed the <b>most</b>? Tap its line or its box.</p>', [], 'now', 'Part 2 · quiz');
    $$('#steps button[data-go="sched"]').forEach(b => b.classList.add('done'));
  }
  function bestBox() { let b = 0; S.five.forEach((f, i) => { if (f.s && f.s.n > S.five[b].s.n) b = i; }); return b; }
  function selectBox(i) {
    S.watch = i; drops.length = 0; renderBoxes(); schedCaption(); plate();
    if (S.quiz === 'ask') answerQuiz(i);
  }
  function answerQuiz(i) {
    const b = bestBox(), f = S.five[i], fb = S.five[b];
    S.quiz = 'done';
    if (i === b) coach('<p><b>Spot on: ' + RULES[f.kind].name + '!</b> ' + f.s.n + ' presses. ' + RULES[f.kind].why + '</p><p>Now tap the other boxes to see how each rule shapes its line.</p>', nextActs(), 'yay', 'Part 2 · quiz');
    else coach('<p><b>Not quite.</b> ' + RULES[f.kind].name + ' pressed ' + f.s.n + ' times, but <b>' + RULES[fb.kind].name + '</b> pressed ' + fb.s.n + '. Look for the steepest line.</p><p>' + RULES[fb.kind].why + '</p>', nextActs(), 'oops', 'Part 2 · quiz');
    renderBoxes(); schedCaption();
  }
  function afterQuiz(again) {
    if (S.quiz === 'ask') return coach('<p><b>Quick quiz!</b> Which rat pressed the <b>most</b>? Tap its line or its box.</p>', [], 'now', 'Part 2 · quiz');
    coach('<p>' + (again ? 'Welcome back. ' : '') + 'Tap any box to see how its rule shapes the line. Ratio rules count <b>presses</b>; interval rules count <b>time</b>.</p>', nextActs(), '', 'Part 2');
  }
  function nextActs() { return [{ label: 'Part 3: the feeder breaks →', primary: true, go: () => go('ext') }, { label: 'Run again', cls: 'btn back', go: runFive }]; }
  function renderBoxes() {
    const b = S.run === 'done' && S.quiz === 'done' ? bestBox() : -1;
    $$('#boxes button').forEach((el, i) => {
      el.classList.toggle('on', i === S.watch); el.classList.toggle('best', i === b);
      el.querySelector('i').textContent = S.five && S.five[i].s ? S.five[i].s.n : '·';
      el.style.setProperty('--c', COL[KINDS[i]]);
      el.setAttribute('aria-label', 'Box ' + RULES[KINDS[i]].box + ', ' + RULES[KINDS[i]].name + ': ' + RULES[KINDS[i]].plain);
    });
  }
  function schedCaption() {
    const r = RULES[KINDS[S.watch]];
    let html = '<b>Box ' + r.box + ' · ' + r.name + '.</b> ' + r.plain;
    if (S.run === 'done' && S.quiz === 'done') html += '<br>' + r.shape + '<span class="ex">' + r.ex + '</span>';
    $('#schedCap').innerHTML = html;
  }
  let countT = 0;
  function schedTick(dt) {
    if (S.run === 'running') {
      let left = dt * LAPSE2;
      while (left > 1e-6) {
        const h = Math.min(0.05, left); left -= h;
        S.five.forEach(f => { if (!f.s.done()) f.s.step(h); f.rat.update(h); });
      }
      if ((countT += dt) > 0.25) { countT = 0; renderBoxes(); }
      const f = S.five[S.watch];
      say('Box ' + RULES[f.kind].box + ' · ' + RULES[f.kind].name + ' · ' + f.s.n + ' presses · ' + f.s.food + ' pellets');
      if (S.five.every(x => x.s.done())) finishFive();
    } else {
      S.five.forEach(f => f.rat.update(dt));
      const f = S.five[S.watch];
      say(f.s ? 'Box ' + RULES[f.kind].box + ' · ' + RULES[f.kind].name + ': ' + f.s.n + ' presses, ' + f.s.food + ' pellets.' : 'Five rats, waiting at their levers.');
    }
  }
  $$('#boxes button').forEach(b => { b.onclick = () => { ac(); selectBox(+b.dataset.i); }; });

  /* ================================================================ part 3: the feeder breaks */
  function idleSession(rat) { const s = new Session(rat, 'EXT'); s.offAt = Infinity; s.duration = Infinity; return s; }
  function enterExt() {
    if (!S.extRat) { S.extRat = new Rat(); S.extRat.toBox(); }
    if (S.extPhase === 'guess' && !S.extIdle) S.extIdle = idleSession(S.extRat);
    show('ext');
    extCoach();
  }
  const GUESS = { A: 'She stops at once', B: 'She presses harder first, then gives up', C: 'She keeps pressing forever' };
  function extCoach() {
    const ph = S.extPhase;
    if (ph === 'guess') coach('<p class="ck">Part 3 · Extinction</p><p>' + NAME + ' gets a pellet for <b>every</b> press, and she\'s loving it. Now imagine the feeder breaks. What will she do?</p><p><b>Make a guess:</b></p>',
      Object.keys(GUESS).map(k => ({ label: '<b>' + k + '</b>' + GUESS[k], cls: 'opt', go: () => runExt(k) })), '', 'Part 3', true);
    else if (ph === 'running') coach('<p><b>Feeder on…</b> ten seconds of normal pressing first. Watch for the red dashed line: that\'s when it breaks.</p><p class="small">Your guess: ' + GUESS[S.guess].toLowerCase() + '.</p>', [], '', 'Part 3');
    else if (ph === 'off') coach('<p><b>Feeder OFF!</b> No more pellets. Watch her line…</p>', [], 'now', 'Part 3');
    else if (ph === 'done1') extResult();
    else if (ph === 'day2') coach('<p><b>The next morning.</b> The feeder is still broken. Does ' + NAME + ' remember the lever?</p>', [], '', 'Part 3 · day 2');
    else if (ph === 'done2') extRecovered();
  }
  function runExt(k) {
    ac(); S.guess = k;
    S.ext = new Session(S.extRat, 'EXT'); S.recover = null; S.extIdle = null; S.offSaid = false;
    S.extPhase = 'running'; extCoach();
    $('#chamber').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function extResult() {
    const s = S.ext, off = s.offAt;
    const burst = s.points.filter(p => p[0] > off && p[0] <= off + 7).length;
    const before = s.points.filter(p => p[0] > off - 7 && p[0] <= off).length;
    s.after = s.points.filter(p => p[0] > off).length;
    const head = S.guess === 'B' ? '<p><b>You called it!</b></p>' : '<p><b>Surprise!</b> She didn\'t ' + (S.guess === 'A' ? 'stop at once' : 'keep going forever') + '.</p>';
    coach(head + '<p>Right after the feeder broke she pressed <b>' + burst + '</b> times in 7 seconds, against ' + before + ' just before. That jump is an <b>extinction burst</b>. Then, with no pellets coming, pressing faded away: <b>extinction</b>.</p><p class="small">Like jabbing a lift button that won\'t light up, harder and faster, before giving up. And because ' + NAME + ' was fed for <i>every</i> press, she gave up fast: rats rewarded only sometimes (like the VR 5 rat) keep going far longer. That\'s the <b>partial reinforcement effect</b>.</p>',
      [{ label: 'Come back the next day →', primary: true, go: nextDay }, { label: 'Run it again', cls: 'btn back', go: resetExt }], S.guess === 'B' ? 'yay' : 'oops', 'Part 3');
  }
  function nextDay() {
    S.recover = new Session(S.extRat, 'RECOVER');
    S.extPhase = 'day2'; extCoach(); plate();
  }
  function extRecovered() {
    coach('<p><b>She remembered!</b> After a night\'s rest, ' + S.recover.n + ' presses came back, then faded faster than yesterday.</p><p>That\'s <b>spontaneous recovery</b>. Extinction hides a habit; it doesn\'t delete it.</p>',
      [{ label: 'See your lab report →', primary: true, go: () => go('report') }, { label: 'Run it again', cls: 'btn back', go: resetExt }], 'yay', 'Part 3 done');
  }
  function resetExt() {
    S.ext = null; S.recover = null; S.extPhase = 'guess'; S.guess = null;
    S.extRat = new Rat(); S.extRat.toBox(); S.extIdle = idleSession(S.extRat);
    extCoach(); plate();
  }
  function extSegs() {
    const segs = [];
    if (S.ext) segs.push({ s: S.ext, label: 'Day 1', dur: S.ext.duration });
    if (S.recover) segs.push({ s: S.recover, label: 'Day 2', dur: S.recover.duration });
    return segs;
  }
  function extTick(dt) {
    const rat = S.extRat;
    const s = S.extPhase === 'day2' ? S.recover : (S.extPhase === 'running' || S.extPhase === 'off') ? S.ext : S.extIdle;
    if (!s) { rat.boxPose = 'idle'; rat.update(dt); return; }
    let left = dt * LAPSE3;
    while (left > 1e-6) { const h = Math.min(0.05, left); left -= h; s.step(h); rat.update(h); if (s.done()) break; }
    if (s === S.ext && S.extPhase === 'running' && s.t >= s.offAt && !S.offSaid) { S.offSaid = true; S.extPhase = 'off'; extCoach(); plate(); }
    if (s === S.ext && s.done()) {
      S.extPhase = 'done1'; S.records = S.records.filter(r => r.kind !== 'EXT');
      S.records.push({ kind: 'EXT', label: 'Extinction', segs: [{ s: S.ext, label: 'Day 1', dur: S.ext.duration }] });
      extCoach();
    } else if (s === S.recover && s.done()) {
      S.extPhase = 'done2'; S.records = S.records.filter(r => r.kind !== 'EXT');
      S.records.push({ kind: 'EXT', label: 'Extinction + day 2', segs: extSegs() });
      extCoach(); $$('#steps button[data-go="ext"]').forEach(b => b.classList.add('done'));
    }
    if (s === S.extIdle) say(NAME + ' · feeder on · every press pays');
    else if (s === S.ext) say((s.t < s.offAt ? 'Feeder on' : 'Feeder OFF') + ' · ' + s.n + ' presses');
    else say('Day 2 · feeder off · ' + s.n + ' presses');
  }

  /* ================================================================ lab report */
  function report() {
    show('report');
    const sh = S.sh, offN = Object.values(sh.off).reduce((a, b) => a + b, 0), ran = S.run === 'done';
    const fact = (k, v, sm) => '<div><dt>' + k + '</dt><dd>' + v + (sm ? '<small>' + sm + '</small>' : '') + '</dd></div>';
    const top = ran ? S.five[bestBox()] : null, extDone = S.ext && S.ext.after != null;
    $('#facts').innerHTML =
      fact('Shaping', sh.shaped ? fmt(sh.time) : '—', sh.shaped ? sh.pellets + ' pellets' + (sh.demo ? ' · demo' : '') : 'not finished yet') +
      fact('Off-target pellets', sh.started ? offN : '—', offN ? Object.keys(sh.off).map(k => NICE[k] + ' ×' + sh.off[k]).join(', ') : sh.started ? 'clean timing' : 'not tried yet') +
      fact('Fastest presser', top ? RULES[top.kind].name : '—', top ? top.s.n + ' presses in ' + RUN + ' s' : 'run part 2') +
      fact('Presses with no food', extDone ? S.ext.after : '—', extDone ? 'before she gave up' : 'run part 3');
    const T = [];
    T.push(['Positive reinforcement', 'A pellet right after a move made that move more likely. That\'s operant conditioning: learning from consequences.']);
    T.push(['Shaping', sh.shaped ? 'You rewarded closer and closer moves: turning, walking over, rearing up, pressing.' + (sh.demo ? ' (The demo did the timing.)' : '') : 'Rewarding closer and closer moves toward a goal. Part 1 lets you try it.']);
    T.push(['Conditioned reinforcer', 'The feeder\'s click told ' + NAME + ' food was coming, so it marked the exact moment.']);
    T.push(['Superstitious behaviour', offN ? 'You fed ' + Object.keys(sh.off).map(k => NICE[k]).join(', ') + ' by mistake, and those moves grew too.' : 'Feed late and odd moves grow, like Skinner\'s pigeons and their rituals.']);
    T.push(['Schedules of reinforcement', ran ? 'Five rules, five shapes. Ratio rules count presses, interval rules count time. ' + RULES[top.kind].name + ' pressed fastest.' : 'The rule for when food comes changes how fast and how steadily an animal responds. Part 2 shows all five.']);
    T.push(['Extinction and the extinction burst', extDone ? 'When the food stopped, pressing first spiked, then faded: ' + S.ext.after + ' presses before she quit.' : 'When a response stops paying, it first spikes, then fades. Part 3 shows it.']);
    T.push(['Spontaneous recovery', S.recover && S.recover.done() ? 'A day later, ' + S.recover.n + ' presses came back before fading again.' : 'After a rest, an extinguished response briefly returns.']);
    $('#terms').innerHTML = T.map(t => '<li><b>' + t[0] + '</b><span>' + t[1] + '</span></li>').join('');
    const th = $('#thumbs2'); th.innerHTML = '';
    S.records.forEach(x => thumb(th, x.segs, x.label));
    if (!S.records.length) th.innerHTML = '<p class="small">No records yet. Parts 2 and 3 draw them.</p>';
  }

  /* ================================================================ dialogs, buttons, keys */
  function openSheet(id) {
    const d = document.getElementById(id); if (!d || d.open) return;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    d.scrollTop = 0;
  }
  function closeSheet(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); openSheet(o.dataset.open); return; }
    const c = e.target.closest('[data-close]'); if (c) { closeSheet(c.closest('dialog')); return; }
    const a = e.target.closest('.toc a'); if (a) { e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  $$('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) closeSheet(d); });
    d.addEventListener('close', () => { if (/^#(about|help)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); });
  });

  // returning visitors: remembered on this device only, so the start screen can offer to skip the tour
  const SEEN = 'leverlab.visited';
  let seen = false;
  try { seen = localStorage.getItem(SEEN) === '1'; } catch (e) {}
  function markSeen() { try { localStorage.setItem(SEEN, '1'); } catch (e) {} }
  if (seen) {
    $('#introKick').textContent = 'Welcome back!';
    $('.ways').prepend($('#btnSkip'));
    $('#btnSkip').classList.add('main'); $('#btnSkip b').textContent = 'Jump straight in';
    $('#btnTour b').textContent = 'Replay the tour';
  } else $('#btnTour').classList.add('main');
  $('#btnTour').onclick = () => { ac(); markSeen(); startTour(); };
  $('#btnSkip').onclick = () => { ac(); markSeen(); startShape(false); };
  $$('[data-jump]').forEach(b => { b.onclick = () => { ac(); markSeen(); go(b.dataset.jump); }; });
  $('#btnReplayTour').onclick = () => { closeSheet($('#help')); ac(); startTour(); };
  $('#btnFeed').onclick = () => { ac(); feed('you'); };
  $('#btnAgain').onclick = () => {
    S.sh = freshShape(false); S.five = null; S.run = 'idle'; S.quiz = null; S.records = [];
    S.extRat = null; S.extIdle = null; S.ext = null; S.recover = null; S.extPhase = 'guess';
    startShape(false);
  };
  $('#btnSound').onclick = e => { S.sound = !S.sound; e.currentTarget.setAttribute('aria-pressed', String(S.sound)); if (S.sound) ac(); else if (AC) AC.suspend(); };

  function copy(text, done) {
    const fallback = () => { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); done('Copied.'); } catch (e) { done('Select and copy the text above.'); } t.remove(); };
    try { navigator.clipboard.writeText(text).then(() => done('Copied.'), fallback); } catch (e) { fallback(); }
  }
  const here = () => location.origin + location.pathname.replace(/index\.html$/, '');
  $('#btnShare').onclick = e => { const b = e.currentTarget; copy(here(), m => { b.textContent = m === 'Copied.' ? 'Link copied' : 'Copy failed'; setTimeout(() => { b.textContent = 'Copy link'; }, 1800); }); };
  $('#btnCopyCite').onclick = () => copy($('#citeApa').textContent.replace(/\s+/g, ' ').trim(), m => { $('#copyMsg').textContent = m; });
  $$('.cite-url').forEach(el => { el.textContent = here(); });

  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || S.screen !== 'shape') return;
    const onBtn = e.target.closest && e.target.closest('button, a, summary, input');
    if (e.key === 'f' || e.key === 'F' || (e.key === ' ' && !onBtn)) { e.preventDefault(); if (!$('#btnFeed').disabled && !$('#feedbar').hidden) $('#btnFeed').click(); }
  });

  // links straight to a part or a sheet: #tour #shape #schedules #extinction #report #about #help
  function route() {
    const h = location.hash.slice(1);
    if (h === 'about' || h === 'help') openSheet(h);
    else if (h === 'tour') startTour();
    else if (h === 'shape') go('shape');
    else if (h === 'schedules') go('sched');
    else if (h === 'extinction') go('ext');
    else if (h === 'report') go('report');
  }
  window.addEventListener('hashchange', route);

  /* ================================================================ the loop */
  // ?test exposes the state for the automated browser test; ?speed=N runs the clock N times faster
  const Q = new URLSearchParams(location.search), SPEED = Math.min(8, +Q.get('speed') || 1);
  if (Q.has('test')) window.__lab = { S: S, LADDER: LADDER, go: go };
  function viewRat() { return S.screen === 'sched' && S.five ? S.five[S.watch].rat : S.screen === 'ext' && S.extRat ? S.extRat : S.rat; }
  let last = performance.now(), barT = 0;
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000), dt = real * SPEED; last = now;
    if (!document.hidden && S.screen !== 'report') {
      if (S.screen === 'sched') schedTick(dt);
      else if (S.screen === 'ext') extTick(dt);
      else for (let left = dt; left > 1e-6;) {
        const h = Math.min(0.05, left); left -= h;
        S.rat.update(h);
        if (S.screen === 'shape') shapeTick(h);
      }
      const vr = viewRat(), quiet = S.screen === 'sched' || S.screen === 'ext', lapse = S.screen === 'sched' ? LAPSE2 : LAPSE3;
      if (S.screen === 'sched') S.five.forEach(f => { if (f.rat !== vr) f.rat.events.length = 0; });
      vr.events.splice(0).forEach(ev => {
        if (ev.type === 'act' && !quiet && SAYS[ev.label]) say(SAYS[ev.label].replace(/^It /, NAME + ' '));
        else if (ev.type === 'press') sfx.lever();
        else if (ev.type === 'drop') { drops.push({ t: 0 }); if (quiet) { sfx.click(); sfx.tink(0.12); } else sfx.tink(); }
        else if (ev.type === 'off') sfx.off();
      });
      for (let i = drops.length - 1; i >= 0; i--) { drops[i].t += dt * (quiet ? lapse : 1); if (drops[i].t > 0.6) drops.splice(i, 1); }
      if (S.screen === 'shape' && (barT += dt) > 0.4) { barT = 0; renderBars(); }
      drawScene(vr, now / 1000); blit(vr, real);
      if (S.screen === 'sched' && S.five) drawRace(rec, S.five, S.watch);
      else if (S.screen === 'ext') { const sg = extSegs(); if (sg.length) drawRecord(rec, sg); else paper(rec); }
    }
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', fitBox);
  fitBox(); renderLadder(); renderHunger();
  route();
  requestAnimationFrame(frame);
})();
