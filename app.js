(() => {
  // --- UTILS & HELPERS ---
  const $ = s => document.querySelector(s);
  const el = (tag, className, html) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clampScore = x => Math.round(Math.max(0, Math.min(1, x)) * 1000);
  
  const fmtDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => fmtDate(new Date());
  const yest = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmtDate(d); };
  const dayNo = () => Math.floor((Date.parse(today()) - Date.parse('2026-01-01')) / 864e5) + 1;

  // PRNG deterministico per la sfida del giorno
  function rng(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    let a = h >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // --- STATE & STORAGE ---
  let S = { streak: 0, best: 0, bestI: 0, last: '', days: {}, mute: false, ice: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem('nexus_state') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('nexus_state', JSON.stringify(S)); } catch (e) {} };

  // --- AUDIO SYNTHESIZER (WEB AUDIO API) ---
  let AC;
  function tone(f, d = 0.1, type = 'square', v = 0.06, f2) {
    if (S.mute) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(AC.destination);
      o.start(t);
      o.stop(t + d);
    } catch (e) {}
  }

  const sfx = {
    ui: () => tone(660, 0.07, 'square', 0.04, 990),
    tap: () => tone(300 + Math.random() * 250, 0.05, 'triangle', 0.08),
    go: () => tone(880, 0.25, 'sawtooth', 0.07, 1760),
    hit: () => tone(520, 0.1, 'square', 0.05, 1040),
    bad: () => tone(180, 0.35, 'sawtooth', 0.08, 60),
    beat: () => tone(440, 0.09, 'sine', 0.12),
    win: () => [0, 1, 2, 3].forEach(i => setTimeout(() => tone(440 * 1.26 ** i, 0.18, 'square', 0.05), i * 90)),
    l1: () => [0, 1, 2, 3, 4].forEach(i => setTimeout(() => tone(660 * 1.19 ** i, 0.14, 'sawtooth', 0.05), i * 60)),
    l2: () => {
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => setTimeout(() => tone(440 * 1.12 ** i, 0.16, 'square', 0.06), i * 70));
      setTimeout(() => { tone(880, 0.8, 'sawtooth', 0.07); tone(1108, 0.8, 'sawtooth', 0.05); }, 620);
    }
  };

  // --- ARENA CORE ---
  const A = $('#arena');
  let P = null, RND = Math.random, RUN = 0;

  const showScreen = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));

  // Gestione Input Spazio + Touch/Pointer
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat && $('#game').classList.contains('on')) {
      e.preventDefault();
      if (P) P();
    }
  });

  A.addEventListener('pointerdown', e => {
    if (P && !e.target.closest('button')) P();
  });

  const lvls = (m, seed, ice) => {
    if (ice) return [3, 3, 3];
    const g = rng(seed), a = g() < 0.2 ? [2, 2, 2] : [1, 2, 3];
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(g() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pips = n => n ? '●'.repeat(n) + '○'.repeat(3 - n) : '';

  // --- GAME DEFINITIONS ---
  const M = {
    sprint: {
      n: 'SPRINT', ic: '⚡', d: 'Pure reaction & speed duel', r: [
        {
          n: 'BURST',
          h: L => 'Tap as fast as you can before time runs out. First tap starts the timer.' + (L > 1 ? ' Button moves around!' : ' SPACE key enabled.'),
          f: burst, nc: 1
        },
        {
          n: 'SIGNAL',
          h: L => 'Wait for the NOW! signal, then strike. False start penalizes.' + (L > 1 ? ' Watch out for fake flashes.' : ''),
          f: signal
        },
        {
          n: 'GRID',
          h: L => 'Click each target as soon as it appears.' + (L > 1 ? ' Targets are smaller and faster.' : ''),
          f: grid
        }
      ]
    },
    trace: {
      n: 'TRACE', ic: '◎', d: 'Tracking & motion precision', r: [
        {
          n: 'FOLLOW',
          h: L => 'Click the ball to start, then keep the glowing dot locked inside it.',
          f: L => trace([40, 34, 28][L - 1], [1.2, 1.6, 2][L - 1], [0.5, 1.2, 2][L - 1], 1, 0)
        },
        {
          n: 'DECOY',
          h: L => 'Click the pink ball. After a moment, decoys will spawn!',
          f: L => trace([38, 34, 30][L - 1], [1, 1.2, 1.4][L - 1], 0.7, [5, 8, 12][L - 1], 0)
        },
        {
          n: 'MIRROR',
          h: L => 'Controls are mirrored: move opposite to guide the dot.',
          f: L => trace([52, 44, 36][L - 1], [0.9, 1.1, 1.35][L - 1], [0.4, 0.7, 1.2][L - 1], 1, 1)
        }
      ]
    },
    sync: {
      n: 'SYNC', ic: '◈', d: 'Parry timing & rhythm accuracy', r: [
        {
          n: 'SWEEP',
          h: L => 'Press the instant the moving indicator hits the target ring.' + (L > 1 ? ' Indicator fades near target!' : ''),
          f: L => sync('bar', L)
        },
        {
          n: 'COLLAPSE',
          h: L => 'Press when the outer ring overlaps the core.' + (L > 1 ? ' Ring fades early.' : ''),
          f: L => sync('ring', L)
        },
        {
          n: 'RHYTHM',
          h: L => 'Follow the beat sequence and hit the final target.',
          f: L => sync('beat', L)
        }
      ]
    }
  };

  // --- ENGINE LOGIC ---
  function ready(name, help, index, cdn, difficulty) {
    P = null;
    A.onpointermove = A.onpointerdown = null;
    A.style.cursor = '';
    A.classList.remove('shake');
    return new Promise(resolve => {
      A.innerHTML = `
        <div class="intro">
          <small>ROUND ${index}/3</small>
          <h2>${name}</h2>
          ${difficulty ? `<div class="lv">DIFFICULTY ${pips(difficulty)}</div>` : ''}
          <p>${help}</p>
          <button class="btn">READY</button>
        </div>`;
      A.querySelector('button').onclick = async () => {
        sfx.ui();
        if (cdn) {
          for (let n = 3; n > 0; n--) {
            A.innerHTML = `<div class="cd">${n}</div>`;
            tone(n > 1 ? 440 : 880, 0.15, 'square', 0.07);
            await sleep(1000);
          }
        }
        resolve();
      };
    });
  }

  // GAME 1: BURST
  function burst(L) {
    const me = RUN, D = 4000 + Math.round(RND() * 2) * 1000, H = rng('' + RND());
    const ref = [8, 6.5, 5][L - 1], per = [0, 6, 3][L - 1];
    return new Promise(resolve => {
      A.innerHTML = '<div class="big">TAP</div><div class="cnt">0</div><div class="bar"><i></i></div>';
      let n = 0, t0 = 0;
      const c = A.querySelector('.cnt'), bi = A.querySelector('.bar i'), b = A.querySelector('.big');

      const loop = () => {
        if (me !== RUN) return;
        const p = (performance.now() - t0) / D;
        bi.style.height = (100 - p * 100) + '%';
        if (p >= 1) {
          P = null;
          sfx.win();
          resolve({ score: clampScore(n / (D / 1000) / ref), d: `${n} taps · ${(n / (D / 1000)).toFixed(1)}/s` });
        } else requestAnimationFrame(loop);
      };

      const hop = () => {
        b.style.cssText = `position:absolute;left:${15 + H() * 70}%;top:${18 + H() * 50}%;translate:-50% -50%;width:${L > 2 ? 110 : 140}px;pointer-events:auto`;
      };

      const hit = () => {
        if (!t0) { t0 = performance.now(); loop(); }
        n++; c.textContent = n; sfx.tap();
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        if (per && n % per === 0) hop();
      };

      if (per) { hop(); b.onpointerdown = e => { e.stopPropagation(); hit(); }; }
      else P = hit;
    });
  }

  // GAME 2: SIGNAL
  async function signal(L) {
    const me = RUN, ts = [];
    for (let k = 0; k < 3; k++) {
      A.innerHTML = `<div class="sig">WAIT…</div><div class="cnt">${k + 1}/3</div>`;
      const s = A.querySelector('.sig'), d1 = 1200 + RND() * 2800, d2 = RND();
      const fk = L > 1 && (k === 1 || (L > 2 && k === 2));

      ts.push(await new Promise(res => {
        let live = 0, t0;
        const tm = [], T = (f, d) => tm.push(setTimeout(f, d));
        const real = () => {
          live = 1; t0 = performance.now();
          s.classList.remove('fake'); s.classList.add('go');
          s.textContent = 'NOW!'; sfx.go();
        };

        T(() => {
          if (fk) {
            s.classList.add('fake'); s.textContent = 'FAKE'; tone(300, 0.25, 'sawtooth', 0.06);
            T(() => { s.classList.remove('fake'); s.textContent = 'WAIT…'; T(real, 700 + d2 * 900); }, 500);
          } else real();
        }, d1);

        P = () => {
          tm.forEach(clearTimeout); P = null;
          if (!live) {
            sfx.bad(); s.classList.remove('fake'); s.textContent = 'TOO EARLY'; res(700);
          } else {
            const ms = performance.now() - t0;
            sfx.hit(); s.textContent = Math.round(ms) + ' ms'; res(ms);
          }
        };
      }));

      await sleep(900);
      if (me !== RUN) return new Promise(() => {});
    }
    P = null;
    const avg = ts.reduce((a, b) => a + b) / 3;
    return { score: clampScore((650 - avg) / 480), d: 'avg ' + Math.round(avg) + ' ms' };
  }

  // GAME 3: GRID
  function grid(L) {
    const me = RUN, N = 4 + L, [lo, hi] = [[62, 80], [44, 64], [28, 44]][L - 1], ref = [900, 1100, 1300][L - 1];
    return new Promise(resolve => {
      A.innerHTML = '';
      let i = 0; const ts = [];
      const next = () => {
        if (me !== RUN) return;
        if (i >= N) {
          const avg = ts.reduce((a, b) => a + b) / N;
          return resolve({ score: clampScore((ref - avg) / (ref * 0.6)), d: 'avg ' + Math.round(avg) + ' ms/target' });
        }
        const t = el('div', 'tgt'), z = lo + RND() * (hi - lo);
        t.style.width = t.style.height = z + 'px';
        t.style.margin = -z / 2 + 'px';
        t.style.left = (10 + RND() * 80) + '%';
        t.style.top = (15 + RND() * 70) + '%';
        A.append(t);
        const t0 = performance.now();

        t.onpointerdown = e => {
          e.stopPropagation();
          ts.push(performance.now() - t0);
          sfx.hit(); t.remove(); i++;
          setTimeout(next, 150 + RND() * 250);
        };
      };
      next();
    });
  }

  // GAME 4: TRACE
  function trace(rad, sp, jit, n, mir) {
    const me = RUN;
    return new Promise(resolve => {
      A.innerHTML = `
        <div class="tr wait"></div>
        ${'<div class="tr"></div>'.repeat(n - 1)}
        <div class="msg">CLICK THE ${n > 1 ? 'PINK ' : ''}BALL TO START</div>
        <b class="pt"></b>
        <div class="cnt">0%</div>
        <div class="bar"><i></i></div>`;

      const pt = A.querySelector('.pt'), B = [...A.querySelectorAll('.tr')], c = A.querySelector('.cnt'), bi = A.querySelector('.bar i'), msg = A.querySelector('.msg');
      const ph = B.map(() => [0, 1, 2, 3].map(() => RND() * 6.28)), D = 6000, W = A.clientWidth, H = A.clientHeight;
      B.forEach(b => b.style.width = b.style.height = rad * 2 + 'px');
      if (n > 1) B[0].classList.add('me');

      let px = -999, py = -999, inT = 0, was = false, t0 = 0, last = 0, hl = n > 1;

      const F = (q, t) => [Math.sin(t + q[0]) * W * 0.3 + Math.sin(t * 2.1 + q[1]) * W * 0.07 * jit, Math.sin(t * 1.3 + q[2]) * H * 0.3 + Math.cos(t * 2.7 + q[3]) * H * 0.07 * jit];
      const pos = (i, t) => { const f = F(ph[i], t), f0 = F(ph[i], 0), k = n > 1 ? 0 : Math.max(0, 1 - t / 2); return [W / 2 + f[0] - f0[0] * k, H / 2 + f[1] - f0[1] * k]; };
      const place = (i, x, y) => B[i].style.transform = `translate(${x - rad}px,${y - rad}px)`;
      const dot = () => mir ? [W - px, H - py] : [px, py];

      const upd = e => {
        const b = A.getBoundingClientRect();
        px = e.clientX - b.left; py = e.clientY - b.top;
        const [dx, dy] = dot();
        pt.style.opacity = 1; pt.style.transform = `translate(${dx}px,${dy}px)`;
      };

      B.forEach((b, i) => { const [x, y] = pos(i, 0); place(i, x, y); });
      A.style.cursor = 'none'; A.onpointermove = upd;

      const go = () => {
        t0 = last = performance.now(); msg.remove(); B[0].classList.remove('wait'); sfx.go();
        (function f() {
          if (me !== RUN) return;
          const now = performance.now(), el_ = (now - t0) / 1000, [dx, dy] = dot();
          let x0, y0;
          B.forEach((b, i) => { const [x, y] = pos(i, el_ * sp); if (!i) { x0 = x; y0 = y; } place(i, x, y); });

          const ins = Math.hypot(dx - x0, dy - y0) < rad + 9;
          if (ins) inT += now - last;
          last = now;

          if (hl && el_ > 1.5) { hl = false; B[0].classList.remove('me'); }
          if (ins !== was) { was = ins; B[0].classList.toggle('lock', ins); tone(ins ? 700 : 260, 0.06, 'triangle', 0.04); }

          const p = (now - t0) / D;
          bi.style.height = (100 - p * 100) + '%';
          c.textContent = Math.round(inT / (now - t0) * 100) + '%';

          if (p >= 1) {
            A.onpointermove = A.onpointerdown = null;
            const pc = inT / D; sfx.win();
            resolve({ score: clampScore(pc / 0.85), d: Math.round(pc * 100) + '% locked on' });
          } else requestAnimationFrame(f);
        })();
      };

      A.onpointerdown = e => {
        if (t0) return; upd(e);
        const [dx, dy] = dot(), [x, y] = pos(0, 0);
        if (Math.hypot(dx - x, dy - y) < rad + 9) go();
        else { sfx.bad(); msg.textContent = 'CLICK DIRECTLY ON THE ' + (n > 1 ? 'PINK ' : '') + 'BALL'; }
      };
    });
  }

  // GAME 5: SYNC
  const RY = [
    [[1, 1, 1], [1, 1, 1, 1]],
    [[1.3, 1.05, 0.8, 0.6], [0.6, 0.8, 1.05, 1.3], [1, 0.5, 0.5, 1]],
    [[1, 0.5, 0.5, 1, 0.5], [0.75, 0.75, 1.5, 0.75, 0.75], [1, 0.5, 1, 0.5, 1]]
  ];

  function sync(type, L) {
    const me = RUN;
    return new Promise(resolve => {
      const pat = RY[L - 1][Math.floor(RND() * RY[L - 1].length)], nb = pat.length;
      const b = [600, 520, 460][L - 1] * (0.95 + RND() * 0.1);
      const bt = pat.reduce((a, g, i) => (i < nb - 1 && a.push(a[i] + g * b), a), [0]);
      const dir = RND() < 0.5 ? 1 : -1, bd = [2800, 2400, 2100][L - 1] * (0.9 + RND() * 0.2);
      const z = 0.55 + RND() * 0.3, zp = dir > 0 ? z : 1 - z, hid = (L - 1) * 0.12;
      const T = type === 'bar' ? z * bd : type === 'ring' ? [1600, 1250, 950][L - 1] * (0.92 + RND() * 0.16) : bt[nb - 1] + pat[nb - 1] * b;

      A.innerHTML = (type === 'bar' ? `<div class="track"><span class="nd" style="left:${zp * 100}%"></span><i class="mk"></i></div>` : type === 'ring' ? '<div class="core"></div><div class="rg"></div>' : '<div class="dots">' + '<i></i>'.repeat(nb) + '<i class="q">?</i></div>') + '<div class="cnt res">&nbsp;</div>';

      const mk = A.querySelector('.mk'), rg = A.querySelector('.rg'), dots = [...A.querySelectorAll('.dots i')], out = A.querySelector('.res');
      if (type === 'ring') out.style.cssText = 'position:absolute;bottom:24px';

      const t0 = performance.now() + 350;
      let done = 0, k = 0;

      const end = err => {
        done = 1; P = null;
        if (err == null) {
          sfx.bad(); out.textContent = 'MISSED';
          return setTimeout(() => resolve({ score: 0, d: 'missed', w: 'MISSED' }), 700);
        }
        const a = Math.abs(err), Lv = a < 2 ? 2 : a <= 10 ? 1 : 0;
        const s = (err > 0 ? '+' : '') + Math.round(err) + ' ms', tt = a < 2 ? 'exact' : err > 0 ? 'late' : 'early';
        sfx.hit(); out.textContent = s + ' · ' + tt; out.classList.add('pop');
        setTimeout(() => resolve({ score: clampScore(1 - a / 300), d: 'off by ' + s + ' (' + tt + ')', lvl: Lv, w: Lv === 2 ? 'PERFECT' : Lv ? 'SURGICAL' : null }), 500);
      };

      P = () => {
        const t = performance.now() - t0;
        if (t < -150 || done) return;
        end(t - T);
      };

      (function f() {
        if (me !== RUN || done) return;
        const t = performance.now() - t0;
        if (type === 'bar') {
          const q = Math.max(0, Math.min(1, t / bd));
          mk.style.left = (dir > 0 ? q : 1 - q) * 100 + '%';
          mk.style.opacity = hid && q > z - hid && q < z + 0.03 ? 0 : 1;
        }
        if (type === 'ring') {
          rg.style.transform = `translate(-50%,-50%) scale(${Math.max(1,Math.min(4,4-3*t/T))})`;
          rg.style.opacity = hid && t / T > 1 - hid * 1.25 && t < T + 60 ? 0 : 1;
        }
        if (type === 'beat' && k < nb && t >= bt[k]) {
          dots[k].classList.add('on'); sfx.beat(); k++;
        }
        if (t > T + 300) { end(null); return; }
        requestAnimationFrame(f);
      })();
    });
  }

  const word = s => s >= 900 ? 'EXCELLENT' : s >= 750 ? 'GREAT' : s >= 550 ? 'GOOD' : s >= 300 ? 'FAIR' : 'TRY AGAIN';

  function banner(w, l) {
    A.append(el('div', 'vd l' + l, w));
    if (l) { fx(l); l > 1 ? sfx.l2() : sfx.l1(); }
  }

  function fx(l) {
    const C = ['#ff8a1f', '#ff2e97', '#a64dff', '#ffd23f'];
    A.append(el('div', 'fl'));
    for (let i = 0; i < (l > 1 ? 90 : 36); i++) {
      const p = el('i', 'pa'), a = Math.random() * 6.28, d = 60 + Math.random() * (l > 1 ? 300 : 150);
      p.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;background:${C[i % 4]}`;
      A.append(p);
    }
    if (l > 1) { A.classList.add('shake'); setTimeout(() => A.classList.remove('shake'), 600); }
  }

  // --- GAME FLOW MANAGEMENT ---
  async function play(mode, practice) {
    const me = ++RUN;
    const ice = !!S.ice;
    RND = practice ? Math.random : rng(today() + mode + (ice ? '!' : ''));
    const LV = lvls(mode, practice ? '' + Math.random() : today() + mode + 'L', ice);

    showScreen('game');
    const res = [];

    for (let i = 0; i < 3; i++) {
      const d = M[mode].r[i], L = LV[i];
      $('#gt').textContent = M[mode].n + (ice ? ' ❄' : '') + (practice ? ' · PRACTICE' : '');
      $('#gr').textContent = (i + 1) + '/3';

      await ready(d.n, typeof d.h === 'function' ? d.h(L) : d.h, i + 1, !d.nc, L);
      if (me !== RUN) return;

      const x = await d.f(L);
      if (me !== RUN) return;

      const w = x.w || word(x.score), l = x.lvl ?? (x.score >= 950 ? 1 : 0);
      banner(w, l);
      await sleep(l ? 2200 : 1400);
      if (me !== RUN) return;

      res.push({ n: d.n, ...x, w });
    }
    finish(mode, res, practice);
  }

  function finish(mode, res, practice) {
    const tot = res.reduce((a, x) => a + x.score, 0), t = today();
    if (!practice) {
      const ic = !!S.ice;
      (S.days[t] = S.days[t] || {})[mode + (ic ? '!' : '')] = tot;
      if (S.last !== t) {
        S.streak = S.last === yest() ? S.streak + 1 : 1;
        S.last = t;
      }
      const dt = Object.entries(S.days[t]).filter(([k]) => k.endsWith('!') === ic).reduce((a, [, b]) => a + b, 0);
      if (ic) S.bestI = Math.max(S.bestI | 0, dt);
      else S.best = Math.max(S.best, dt);
      save();
    }

    const f = tot / 3000;
    const rank = f > 0.9 ? 'GHOST IN THE SHELL' : f > 0.75 ? 'NETRUNNER' : f > 0.55 ? 'SOLO' : f > 0.35 ? 'SCRIPT KIDDIE' : 'NOOB.EXE';
    sfx.win();

    $('#result').innerHTML = `
      <small>${practice ? 'PRACTICE' : 'NEXUS #' + dayNo() + (S.ice ? ' · BLACK ICE' : '')} · ${M[mode].n}</small>
      <div class="big2">${tot}</div>
      <div class="rank">${rank}</div>
      <div class="rows">
        ${res.map(x => `
          <div class="row">
            <span>${x.n}</span>
            <div class="bar"><i style="width:${x.score / 10}%"></i></div>
            <em><b class="w">${x.w}</b> · ${x.d}</em>
          </div>`).join('')}
      </div>
      <button class="btn" id="rb">MENU</button>`;

    $('#rb').onclick = () => { sfx.ui(); menu(); };
    showScreen('result');
  }

  function menu() {
    showScreen('menu');
    const t = today(), d = S.days[t] || {};
    $('#day').textContent = 'NEXUS #' + dayNo();
    $('#streak').textContent = '🔥' + ((S.last === t || S.last === yest()) ? S.streak : 0);

    const ice = !!S.ice, sf = ice ? '!' : '';
    document.documentElement.classList.toggle('ice', ice);
    $('#ice').textContent = ice ? 'BLACK ICE · ON' : 'BLACK ICE · OFF';
    $('#best').textContent = (ice ? S.bestI : S.best) || 0;
    $('#total').textContent = Object.entries(d).filter(([k]) => k.endsWith('!') === ice).reduce((a, [, b]) => a + b, 0);

    const C = $('#cards'); C.innerHTML = '';
    Object.entries(M).forEach(([k, m], i) => {
      const v = d[k + sf], done = v != null;
      const c = el('div', 'card' + (done ? ' done' : ''), `
        <div class="ic">${m.ic}</div>
        <div class="ct">
          <h3>${m.n}</h3>
          <p>${m.d} · ${lvls(k, t + k + 'L', ice).map(pips).join(' ')}</p>
        </div>
        <div class="ca">
          <button class="btn">${done ? v + ' ✓' : 'PLAY'}</button>
          <button class="ghost">Practice</button>
        </div>`);

      c.style.animationDelay = i * 0.1 + 's';
      const [a, b] = c.querySelectorAll('button');
      a.disabled = done;
      a.onclick = () => { sfx.ui(); play(k, false); };
      b.onclick = () => { sfx.ui(); play(k, true); };
      C.append(c);
    });
  }

  let toastT;
  const toast = t => {
    const e = $('#toast'); e.textContent = t; e.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2000);
  };

  $('#share').onclick = () => {
    sfx.ui();
    const t = today(), sf = S.ice ? '!' : '', d0 = S.days[t] || {};
    const d = Object.fromEntries(Object.keys(M).filter(k => d0[k + sf] != null).map(k => [k, d0[k + sf]]));
    if (!Object.keys(d).length) return toast('Complete at least one challenge');

    const bl = v => { const n = Math.round(v / 600); return '🟧'.repeat(n) + '⬛'.repeat(5 - n); };
    const tot = Object.values(d).reduce((a, b) => a + b, 0);
    const txt = `NEXUS #${dayNo()}${S.ice ? ' ❄ BLACK ICE' : ''} 🔥${S.streak}\n` +
      Object.entries(M).map(([k, m]) => m.ic + ' ' + (d[k] != null ? bl(d[k]) + ' ' + d[k] : '—')).join('\n') +
      `\nTOTAL ${tot}/9000`;

    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(() => toast('Copied to clipboard! 🚀'))
      .catch(() => toast('Copy unavailable'));
  };

  $('#back').onclick = () => { RUN++; P = null; A.onpointermove = null; sfx.ui(); menu(); };
  $('#ice').onclick = () => { S.ice = !S.ice; save(); sfx.ui(); menu(); if (S.ice) sfx.l1(); };

  const mu = $('#mute');
  mu.classList.toggle('off', S.mute);
  mu.onclick = () => { S.mute = !S.mute; mu.classList.toggle('off', S.mute); save(); sfx.ui(); };

  // Timer reset a mezzanotte
  let shown = today();
  setInterval(() => {
    const n = new Date(), m = new Date(n);
    m.setHours(24, 0, 0, 0);
    const s = Math.floor((m - n) / 1e3);
    $('#cd').textContent = [s / 3600 | 0, s / 60 % 60 | 0, s % 60].map(v => String(v).padStart(2, '0')).join(':');
    if (shown !== today() && $('#menu').classList.contains('on')) { shown = today(); menu(); }
  }, 1000);

  menu();
})();
