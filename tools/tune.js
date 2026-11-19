// Tuning harness: runs simulated visitors through stage 1 (shaping) and reports how long it takes.
// node tools/tune.js
const { Rat, LADDER, NEED } = require('../js/rat.js'); const LIMIT = +process.env.LIMIT || 999;
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

function run(policy, seed) {
  const rng = mulberry(seed), prng = mulberry(seed * 7 + 3);
  const rat = new Rat(rng);
  const stepT = []; let lastStepT = 0; let pressAt = -1, pressReact = 0, pressFed = true; let step = 0; const prog = [0,0,0,0]; let t = 0, pellets = 0, fedEntry = null, presses = 0, nextRandom = 3;
  const dt = 1/30; const off = {};
  while (t < 600 && step < 4 && rat.full < LIMIT) {
    rat.update(dt); t += dt;
    for (const ev of rat.events) if (ev.type === 'press') { pressAt = t; pressReact = policy.react ? policy.react[0] + prng() * policy.react[1] : 0; pressFed = false; }
    rat.events.length = 0;
    const e = rat.log[rat.log.length - 1];
    let feed = false;
    if (policy.kind === 'random') { if (t >= nextRandom) { feed = true; nextRandom = t + 2 + prng() * 4; } }
    else if (step === 3 && !pressFed && pressAt > 0 && t - pressAt >= pressReact) { pressFed = true; if (prng() > policy.miss) feed = true; }
    else if (e !== fedEntry && e.label !== 'press') {
      const j = LADDER.indexOf(e.label);
      const age = t - e.t0;
      if (!e.react) e.react = policy.react[0] + prng() * policy.react[1];
      if (j >= step && age >= e.react) { fedEntry = e; if (prng() > policy.miss) feed = true; }
      else if (j < 0 && e.label !== 'eat' && e.label !== 'goEat' && age >= e.react && !e.rolled) { e.rolled = true; if (prng() < policy.wrong) { fedEntry = e; feed = true; } }
    }
    if (feed) {
      pellets++;
      const r = rat.feed();
      off[r.label] = (off[r.label] || 0) + 1;
      const j = LADDER.indexOf(r.label);
      if (j >= step) { const s0 = step; prog[step]++; if (prog[step] >= NEED[step]) step++; if (step !== s0) { stepT.push([s0, step, +(t - lastStepT).toFixed(1)]); lastStepT = t; } }
    }
  }
  return { stepT, t, pellets, done: step >= 4, step, off, S: rat.S, presses: rat.presses };
}
function summary(name, policy, n = 200) {
  const rs = []; for (let i = 1; i <= n; i++) rs.push(run(policy, i));
  const ts = rs.filter(r => r.done).map(r => r.t).sort((a,b)=>a-b);
  const q = p => ts.length ? ts[Math.floor(p*(ts.length-1))].toFixed(0) : '-';
  const pel = rs.filter(r=>r.done).map(r=>r.pellets).sort((a,b)=>a-b);
  console.log(`${name.padEnd(10)} done ${rs.filter(r=>r.done).length}/${n}  time p10 ${q(.1)} p50 ${q(.5)} p90 ${q(.9)}  pellets p50 ${pel[Math.floor(pel.length/2)]||'-'}`);
  return rs;
}
summary('sharp', { react: [0.3, 0.2], miss: 0.05, wrong: 0 });
summary('visitor', { react: [0.4, 0.5], miss: 0.25, wrong: 0.08 });
const rnd = summary('random', { kind: 'random' }, 50);
const avg = k => (rnd.reduce((s,r)=>s+r.S[k],0)/rnd.length).toFixed(2);
console.log('random feeder, habits after 10 min: wander', avg('wander'), 'sniff', avg('sniff'), 'groom', avg('groom'), 'spin', avg('spin'), 'rear', avg('rear'), 'press', avg('press'));

const rs = []; for (let i = 1; i <= 200; i++) rs.push(run({ react: [0.3, 0.2], miss: 0.05, wrong: 0 }, i));
const per = {}; rs.forEach(r => r.stepT.forEach(([a,b,d]) => { (per[a] = per[a] || []).push(d); }));
for (const k in per) { const v = per[k].sort((a,b)=>a-b); console.log('leaving step', k, 'n', v.length, 'p50', v[v.length>>1], 'p90', v[Math.floor(v.length*.9)]); }
