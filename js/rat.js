/* Lever Lab: the rat and the box.
   A small rule-based model of a hungry lab rat in an operant chamber. There is no page code in here,
   so the same file runs in Node for tuning (tools/tune.js). Units: logical pixels of the 192×120
   chamber picture, and seconds.

   Learning rule, in one line: whatever the rat was doing when the feeder clicked becomes more likely
   (reinforcement); things it keeps doing with no food slowly drift back to how likely they were at the
   start (extinction). Everything else on screen follows from that rule plus the rat's starting habits. */
(function (root) {
  'use strict';

  const GEOM = { W: 192, H: 120, FLOOR: 104, LEFT: 42, PANEL: 146, WALL: 176 };

  // starting habits: relative weights, and the chance a rear at the panel lands on the lever
  const BASE = { wander: 3.0, sniff: 1.3, groom: 0.8, spin: 0.35, turn: 1.0, approach: 0.55, rear: 0.7, press: 0.2 };
  const CAP = 16;          // no habit grows past this
  const LATENCY = 0.3;     // a visitor taps ~0.3 s after they see the move; credit what happened then
  const EAT = 1.5;         // seconds to eat one pellet

  // what the status line says when an action starts
  const SAYS = {
    wander: 'It wanders off.', sniff: 'It sniffs around.', groom: 'It grooms its face.',
    spin: 'It spins around.', turn: 'It turns toward the lever.', approach: 'It walks to the lever.',
    rear: 'It rears up.', rearLever: 'It rears up at the lever.', press: 'It presses the lever!',
    goEat: 'It hears the click and heads for the cup.', eat: 'It eats the pellet.'
  };
  // the shaping ladder, lowest step first
  const LADDER = ['turn', 'approach', 'rearLever', 'press'];
  const NEED = [1, 1, 2, 3];   // pellets needed at each step before you raise the bar

  function rand(rng, a, b) { return a + (b - a) * rng(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------------------------------------------------------- the rat */
  function Rat(rng) {
    this.rng = rng || Math.random;
    this.S = Object.assign({}, BASE);
    this.x = 84; this.facing = -1;
    this.now = 0;
    this.log = [];            // [{label, t0, t1}] newest last
    this.events = [];         // drained by the page each frame
    this.pellets = 0;         // pellets waiting in the cup
    this.heardAt = -1;        // when the feeder clicked (the rat reacts a beat later)
    this.lastFeed = -9;
    this.lastPress = -9;
    this.presses = 0;
    this.mode = 'free';       // 'free' while you shape it, 'box' once the box takes over
    this.lever = 0;           // 0 up … 1 fully pressed
    this.pose = { rear: 0, crouch: 0, groom: 0, spin: 0, head: 0, leg: 0, walk: 0, paw: 0, sniff: 0, look: 0 };
    this.boxPose = 'idle';
    this.full = 0;            // pellets eaten; a fed rat stops working for food (satiation)
    this.postEat = false;     // just finished eating: it tends to wander off from the cup
    this.begin('sniff');
  }

  Rat.prototype.atPanel = function () { return this.x >= GEOM.PANEL - 4 && this.facing === 1; };

  Rat.prototype.mark = function (label) {
    const last = this.log[this.log.length - 1];
    if (last && last.t1 == null) last.t1 = this.now;
    this.log.push({ label: label, t0: this.now, t1: null });
    if (this.log.length > 40) this.log.shift();
    this.events.push({ type: 'act', label: label });
  };

  Rat.prototype.begin = function (name) {
    const r = this.rng, a = { name: name, t: 0, dur: 1 };
    switch (name) {
      case 'wander': {
        let tx, tries = 0;
        do { tx = this.x > 104 ? rand(r, GEOM.LEFT, 96) : rand(r, GEOM.LEFT, GEOM.PANEL - 26); }
        while (Math.abs(tx - this.x) < 22 && ++tries < 8);
        a.tx = tx; a.speed = rand(r, 22, 30); a.dur = 5;
        this.facing = tx > this.x ? 1 : -1;
        break;
      }
      case 'sniff': a.dur = rand(r, 1.0, 1.8); break;
      case 'groom': a.dur = rand(r, 1.5, 2.3); break;
      case 'spin': a.dur = 1.1; break;
      case 'turn': a.dur = 0.9; a.flipped = false; break;
      case 'approach': a.tx = GEOM.PANEL; a.speed = rand(r, 24, 30); a.dur = 8; a.flipAt = this.facing === 1 ? -1 : 0.2; break;
      case 'rear': {
        a.dur = rand(r, 1.4, 2.0);
        a.lever = this.atPanel();
        a.pressAt = a.lever && r() < this.S.press / (this.S.press + 1) ? a.dur * rand(r, 0.35, 0.6) : -1;
        break;
      }
      case 'goEat': a.tx = GEOM.PANEL; a.dur = 8; a.speed = 62; a.flipAt = this.facing === 1 ? -1 : 0.12; break;
      case 'eat': a.dur = EAT; break;
    }
    this.act = a;
    this.mark(name === 'rear' && a.lever ? 'rearLever' : name);
  };

  Rat.prototype.choose = function () {
    const S = this.S, at = this.atPanel(), opts = [];
    const add = (n, w) => { if (w > 0) opts.push([n, w]); };
    add('wander', S.wander * (this.postEat ? 1.8 : 1));
    this.postEat = false;
    add('sniff', S.sniff);
    add('groom', S.groom);
    add('spin', S.spin);
    if (!at) {
      if (this.facing === -1) add('turn', S.turn);
      add('approach', S.approach * (this.facing === 1 ? 1.3 : 0.6));
    }
    add('rear', S.rear * (at ? 2.5 : 0.6));
    let sum = 0; opts.forEach(o => { sum += o[1]; });
    let pick = this.rng() * sum;
    for (const o of opts) { pick -= o[1]; if (pick <= 0) return o[0]; }
    return opts[opts.length - 1][0];
  };

  // habits drift back toward where they started when they go unrewarded
  Rat.prototype.fade = function (name) {
    if (this.now - this.lastFeed < 1.5) return;
    const key = name === 'rearLever' ? 'rear' : name;
    if (this.S[key] > BASE[key]) this.S[key] -= 0.05 * (this.S[key] - BASE[key]);
  };

  Rat.prototype.walkTo = function (a, dt) {
    const d = a.tx - this.x, step = a.speed * dt;
    this.pose.walk = 1;
    if (Math.abs(d) <= step) { this.x = a.tx; return true; }
    this.x += Math.sign(d) * step;
    return false;
  };

  Rat.prototype.update = function (dt) {
    this.now += dt;
    const p = this.pose;
    p.leg += dt * 9;
    p.walk = 0;
    if (this.mode === 'box') return this.updateBox(dt);

    const a = this.act;
    a.t += dt;
    let done = a.t >= a.dur;

    // the feeder's click: the rat drops what it is doing and goes to the cup
    if (this.pellets > 0 && this.heardAt >= 0 && this.now - this.heardAt > 0.25 && a.name !== 'goEat' && a.name !== 'eat') {
      this.heardAt = -1;
      this.lever = 0;
      return this.begin('goEat');
    }

    switch (a.name) {
      case 'wander':
        if (this.walkTo(a, dt)) done = true;
        break;
      case 'approach':
      case 'goEat':
        if (a.flipAt >= 0 && a.t >= a.flipAt) { this.facing = 1; a.flipAt = -1; }
        if (a.flipAt < 0 && this.walkTo(a, dt)) {
          if (a.name === 'goEat') { this.begin('eat'); return; }
          if (!a.arrived) a.arrived = a.t;
          if (a.t - a.arrived > 0.25) done = true;
        }
        break;
      case 'turn':
        if (!a.flipped && a.t > 0.3) { this.facing = 1; a.flipped = true; }
        break;
      case 'rear':
        if (a.pressAt >= 0 && a.t >= a.pressAt && !a.pressed) {
          a.pressed = true; this.presses++; this.lastPress = this.now;
          this.mark('press');
          this.events.push({ type: 'press' });
        }
        if (a.pressed && a.t - a.pressAt > 0.45 && !a.back) { a.back = true; this.mark('rearLever'); }
        break;
      case 'eat':
        if (done) { this.pellets = Math.max(0, this.pellets - 1); this.full++; this.postEat = true; }
        break;
    }

    this.animate(dt);

    if (done) {
      if (a.name !== 'eat' && a.name !== 'goEat') this.fade(a.name === 'rear' && a.lever ? 'rearLever' : a.name);
      if (a.pressed && this.now - this.lastFeed > 1.5 && this.S.press > BASE.press) this.S.press -= 0.08 * (this.S.press - BASE.press);
      if (this.pellets > 0) this.begin('goEat');
      else this.begin(this.choose());
    }
  };

  // pose targets for the drawing, eased so moves blend
  Rat.prototype.animate = function (dt) {
    const a = this.act, p = this.pose, k = 1 - Math.exp(-dt * 12);
    let rear = 0, crouch = 0, groom = 0, head = 0.12, paw = 0, sniff = 0, look = 0, spin = 0;
    switch (a.name) {
      case 'sniff': head = 0.45; sniff = 1; break;
      case 'groom': groom = 1; head = 0.5; break;
      case 'spin': spin = a.t / a.dur; break;
      case 'turn': look = 1; head = -0.15; break;
      case 'rear': {
        const up = Math.min(1, a.t / 0.25, (a.dur - a.t) / 0.25);
        rear = Math.max(0, up);
        head = -0.1;
        if (a.pressed && a.t - a.pressAt < 0.45) { paw = 1; head = 0.15; }
        break;
      }
      case 'eat': crouch = 1; head = 0.5; sniff = 1; break;
    }
    p.rear += (rear - p.rear) * k;
    p.crouch += (crouch - p.crouch) * k;
    p.groom += (groom - p.groom) * k;
    p.head += (head - p.head) * k;
    p.paw += (paw - p.paw) * Math.min(1, k * 2);
    p.sniff = sniff; p.look = look; p.spin = spin;
    const lever = paw > 0 ? 1 : 0;
    this.lever += (lever - this.lever) * Math.min(1, k * 2.5);
  };

  // the action the rat was doing at time t (or now, if t is in the future)
  Rat.prototype.labelAt = function (t) {
    for (let i = this.log.length - 1; i >= 0; i--) {
      const e = this.log[i];
      if (e.t0 <= t) return { e: e, i: i };
    }
    return { e: this.log[0], i: 0 };
  };

  /* The visitor pressed FEED. A pellet drops, and whatever the rat was doing when the feeder
     clicked gets stronger. Returns what got the credit so the page can explain it. */
  Rat.prototype.feed = function () {
    const busy = this.act.name === 'goEat' || this.act.name === 'eat' || this.pellets > 0;
    this.pellets++;
    this.heardAt = this.now;
    this.events.push({ type: 'drop' });
    if (busy) { this.lastFeed = this.now; return { label: 'eat', busy: true }; }

    let label, prev = null, prevAgo = 0;
    if (this.now - this.lastPress < 0.9) label = 'press';
    else {
      const hit = this.labelAt(this.now - LATENCY);
      label = hit.e.label;
      // what it had just been doing before that, to explain a late tap
      const before = this.log[hit.i - 1];
      if (before) { prev = before.label; prevAgo = this.now - (before.t1 == null ? this.now : before.t1); }
    }
    this.reinforce(label);
    this.lastFeed = this.now;
    return { label: label, prev: prev, prevAgo: prevAgo };
  };

  Rat.prototype.reinforce = function (label) {
    const S = this.S, up = (k, f) => { S[k] = Math.min(CAP, S[k] * f); };
    switch (label) {
      case 'turn': up('turn', 2.1); up('approach', 1.35); break;
      case 'approach': up('approach', 2.1); up('turn', 1.1); up('rear', 1.2); break;
      case 'rearLever': up('rear', 2.2); up('press', 1.7); up('approach', 1.2); break;
      case 'press': up('press', 2.8); up('rear', 1.35); up('approach', 1.3); break;
      case 'rear': up('rear', 1.6); break;
      case 'wander': case 'sniff': case 'groom': case 'spin': up(label, 2.0); break;
    }
    // fed for a step toward the lever, so the rest of its day matters a little less (it hangs around the panel)
    if (LADDER.indexOf(label) >= 0) {
      S.wander = Math.max(0.8, S.wander * 0.84);
      ['sniff', 'groom', 'spin'].forEach(k => { S[k] = Math.max(0.25, S[k] * 0.92); });
    }
  };

  // how likely each habit is right now, for the lab-notes bars (0 … 1)
  Rat.prototype.habits = function () {
    const S = this.S, lg = v => clamp(Math.log(v / 0.1) / Math.log(CAP / 0.1), 0, 1);
    return {
      wander: lg(S.wander), groom: lg(S.groom), spin: lg(S.spin),
      approach: lg(Math.max(S.approach, S.turn * 0.9)), rear: lg(S.rear),
      press: clamp(S.press / (S.press + 1) / 0.9, 0, 1)
    };
  };

  /* ------------------------------------------------- the box takes over (stages 2 and 3) */
  Rat.prototype.toBox = function () {
    this.mode = 'box'; this.x = GEOM.PANEL; this.facing = 1; this.pellets = 0;
    this.boxPose = 'idle'; this.tap = 0; this.idleT = 0;
  };

  Rat.prototype.updateBox = function (dt) {
    const p = this.pose, k = 1 - Math.exp(-dt * 10);
    this.tap = Math.max(0, this.tap - dt);
    this.idleT += dt;
    let rear = 0, crouch = 0, groom = 0, head = 0.12, paw = 0, sniff = 0;
    if (this.boxPose === 'lever') { rear = 1; head = -0.05; paw = this.tap > 0 ? 1 : 0.25; }
    else if (this.boxPose === 'eat') { crouch = 1; head = 0.5; sniff = 1; }
    else { const g = (this.idleT % 5) < 2.4; groom = g ? 1 : 0; head = g ? 0.5 : 0.4; sniff = g ? 0 : 1; }
    p.rear += (rear - p.rear) * k; p.crouch += (crouch - p.crouch) * k; p.groom += (groom - p.groom) * k;
    p.head += (head - p.head) * k; p.paw += (paw - p.paw) * Math.min(1, k * 2.5);
    p.sniff = sniff; p.look = 0; p.spin = 0;
    this.lever += ((this.tap > 0 ? 1 : 0) - this.lever) * Math.min(1, k * 3);
  };

  /* A session on one schedule. step() advances simulated time; presses come at a rate set by the
     schedule and by time since the last pellet, which is what gives each record its shape (after
     Ferster & Skinner, 1957). The patterns are built in, not learned: see "How the simulation works". */
  const RATIO_BAG = [2, 7, 4, 9, 3, 5, 6, 3, 8, 3];          // mean 5
  const INTERVAL_BAG = [4, 14, 8, 18, 6, 12, 3, 15, 9, 11];  // mean 10 s

  function Session(rat, kind, rng) {
    this.rat = rat; this.kind = kind; this.rng = rng || Math.random;
    this.t = 0; this.n = 0; this.food = 0;
    this.points = [[0, 0]];    // [t, cumulative presses]
    this.marks = [];           // [t, n] when food came
    this.notes = [];           // [t, text] e.g. feeder off
    this.eatLeft = 0; this.tau = 0; this.tf = 0; this.count = 0; this.pause = 0; this.gap = 0;
    this.bagI = Math.floor(this.rng() * 10);
    this.req = this.nextRatio(); this.interval = this.nextInterval();
    this.feeder = kind !== 'RECOVER';
    this.offAt = kind === 'EXT' ? 10 : kind === 'RECOVER' ? 0 : Infinity;
    this.duration = { CRF: 36, FR: 45, VR: 45, FI: 45, VI: 45, EXT: 52, RECOVER: 26 }[kind];
    if (kind === 'RECOVER') this.feeder = false;
  }
  Session.prototype.nextRatio = function () { return RATIO_BAG[(this.bagI++) % 10]; };
  Session.prototype.nextInterval = function () { return INTERVAL_BAG[(this.bagI++) % 10]; };

  Session.prototype.rate = function () {
    const tau = this.tau, k = this.kind;
    if (k === 'EXT' && this.t >= this.offAt) {
      const s = this.t - this.offAt;
      return s < 7 ? 2.3 : 0.03 + 2.3 * Math.exp(-(s - 7) / 6);
    }
    if (k === 'RECOVER') return 0.02 + 2.1 * Math.exp(-this.t / 5);
    switch (k) {
      case 'CRF': case 'EXT': return 1.15;
      case 'FR': return 2.7;
      case 'VR': return 2.5;
      case 'FI': return 0.03 + 3.0 * Math.pow(clamp(tau / 8.8, 0, 1), 3.2);
      case 'VI': return 0.9;
    }
    return 0;
  };

  Session.prototype.pays = function () {
    if (!this.feeder || this.t >= this.offAt) return false;
    switch (this.kind) {
      case 'CRF': case 'EXT': return true;
      case 'FR': return this.count >= 5;
      case 'VR': return this.count >= this.req;
      case 'FI': return this.tf >= 10;
      case 'VI': return this.tf >= this.interval;
    }
    return false;
  };

  Session.prototype.step = function (dt) {
    const rat = this.rat;
    if (this.t === 0 && this.kind === 'EXT') this.notes.push([0, 'food on']);
    const wasOn = this.t < this.offAt;
    this.t += dt; this.tf += dt; this.gap += dt;
    if (wasOn && this.t >= this.offAt && this.offAt > 0) { this.notes.push([this.offAt, 'feeder off']); rat.events.push({ type: 'off' }); }
    if (this.eatLeft > 0) {
      this.eatLeft -= dt;
      rat.boxPose = 'eat';
      if (this.eatLeft <= 0) {
        this.tau = 0;
        this.pause = this.kind === 'FR' ? rand(this.rng, 2.5, 5) : this.kind === 'VR' ? rand(this.rng, 0, 0.5) : 0;
      }
      return;
    }
    this.tau += dt;
    if (this.pause > 0) { this.pause -= dt; rat.boxPose = 'idle'; return; }
    const r = this.rate();
    rat.boxPose = r > 0.35 ? 'lever' : 'idle';
    if (this.gap > 0.22 && this.rng() < r * dt) this.press();
  };

  Session.prototype.press = function () {
    const rat = this.rat;
    this.gap = 0; this.n++; this.count++;
    this.points.push([this.t, this.n]);
    rat.tap = 0.12; rat.boxPose = 'lever';
    rat.events.push({ type: 'press' });
    if (this.pays()) {
      this.food++; this.marks.push([this.t, this.n]);
      this.eatLeft = 1.2; this.count = 0; this.tf = 0;
      this.req = this.nextRatio(); this.interval = this.nextInterval();
      rat.events.push({ type: 'drop' });
    }
  };

  Session.prototype.done = function () { return this.t >= this.duration; };

  const api = { Rat: Rat, Session: Session, GEOM: GEOM, BASE: BASE, SAYS: SAYS, LADDER: LADDER, NEED: NEED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeverLab = api;
})(typeof window !== 'undefined' ? window : this);
