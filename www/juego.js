/* Ajedrez — tablero, partidas, reloj, análisis y problemas (IT Canarias)
   © 2026 IT Canarias. Todos los derechos reservados. */
'use strict';
const CH = window.Ajedrez, MO = window.Motor;
const LEVELS = MO.LEVELS;
const LEVEL_DESC = ['', 'Para aprender a mover. Se equivoca a menudo.', 'Ve las capturas sencillas.', 'Juega con algo de cabeza.', 'Calcula varias jugadas.', 'Hay que estar muy atento.', 'Como un jugador de club aficionado.'];
const CLOCKS = [['', 'Sin reloj'], ['3+2', '3+2'], ['5+0', '5+0'], ['10+5', '10+5'], ['15+10', '15+10'], ['custom', 'Otro']];
const BOARDS = {
  madera: { name: 'Madera', l: '#ecd7b0', d: '#b08559' },
  verde:  { name: 'Verde',  l: '#e8ecc9', d: '#6e9a52' },
  azul:   { name: 'Azul',   l: '#dfe7ec', d: '#7b9bb2' },
  gris:   { name: 'Gris',   l: '#dedede', d: '#909090' },
  coral:  { name: 'Coral',  l: '#f4e3d7', d: '#c97a6b' },
};
const PLACEHOLDER = /^(blancas|negras|tú|tu)$/i;
const isPlaceholder = n => PLACEHOLDER.test(String(n || '').trim());
const PNAME = { 1: 'peón', 2: 'caballo', 3: 'alfil', 4: 'torre', 5: 'dama', 6: 'rey' };
const RESULT_TXT = { '1-0': 'Ganan las blancas', '0-1': 'Ganan las negras', '1/2-1/2': 'Tablas' };
const COLOR_TXT = ['blancas', 'negras'];

/* ================= Sonidos (sintetizados: sin archivos de audio) ================= */
const Sound = (() => {
  let ctx = null;
  const ac = () => {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  // golpe de madera: ruido corto filtrado
  function knock(c, t, freq, vol, dur) {
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
  }
  function tone(c, t, freq, dur, vol, type) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function play(kind) {
    if (S.sound === false) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime + 0.01;
    try {
      if (kind === 'move') knock(c, t, 1500, 0.9, 0.06);
      else if (kind === 'capture') { knock(c, t, 900, 1.2, 0.09); knock(c, t + 0.05, 1700, 0.6, 0.05); }
      else if (kind === 'castle') { knock(c, t, 1500, 0.8, 0.05); knock(c, t + 0.09, 1300, 0.8, 0.05); }
      else if (kind === 'check') { knock(c, t, 1400, 0.8, 0.05); tone(c, t + 0.03, 880, 0.18, 0.12, 'triangle'); }
      else if (kind === 'end') { [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.11, f, 0.45, 0.13, 'triangle')); }
      else if (kind === 'ok') { [659, 988].forEach((f, i) => tone(c, t + i * 0.1, f, 0.3, 0.12, 'sine')); }
      else if (kind === 'bad') tone(c, t, 180, 0.25, 0.14, 'square');
    } catch (e) {}
  }
  // tipo de sonido para una jugada
  function forMove(before, uci) {
    const from = CH.sqParse(uci.slice(0, 2)), to = CH.sqParse(uci.slice(2, 4)), p = before.b[from];
    const after = before.clone(); const m = after.fromUci(uci); if (!m) return 'move';
    after.make(m);
    if (after.inCheck()) return 'check';
    if ((p & 7) === CH.KING && Math.abs((to & 7) - (from & 7)) === 2) return 'castle';
    if (before.b[to] || ((p & 7) === CH.PAWN && (from & 7) !== (to & 7))) return 'capture';
    return 'move';
  }
  return { play, forMove };
})();

/* ================= Motor en segundo plano ================= */
const Engine = (() => {
  let w = null, seq = 0; const pend = {};
  const inline = (d, res, rej, prog) => setTimeout(() => { try { res(MO.handle(d, prog)); } catch (e) { rej(e); } }, 20);
  function worker() {
    if (w === false) return null;
    if (w) return w;
    try {
      w = new Worker('motor-worker.js');
      w.onmessage = e => {
        const d = e.data, p = pend[d.id]; if (!p) return;
        if ('progress' in d) { if (p.prog) p.prog(d.progress); return; }
        delete pend[d.id]; d.ok ? p.res(d.res) : p.rej(new Error(d.error));
      };
      w.onerror = ev => { try { ev.preventDefault(); } catch (e) {} w = false; for (const k in pend) { const p = pend[k]; delete pend[k]; inline(p.d, p.res, p.rej, p.prog); } };
    } catch (e) { w = false; return null; }
    return w;
  }
  function call(d, prog) {
    return new Promise((res, rej) => {
      const id = ++seq; d = Object.assign({}, d, { id });
      const ww = worker();
      if (!ww) return inline(d, res, rej, prog);
      pend[id] = { res, rej, prog, d };
      ww.postMessage(d);
    });
  }
  // Para el cálculo en marcha (al deshacer o salir). Las promesas pendientes se quedan sin respuesta.
  function reset() { if (w) { try { w.terminate(); } catch (e) {} w = null; } for (const k in pend) delete pend[k]; }
  return { call, reset };
})();

/* ================= Estado derivado de la partida ================= */
let GS_CACHE = { key: '', v: null };
function gstate(g, ply) {
  const moves = ply == null ? g.moves : g.moves.slice(0, ply);
  const key = (g.startFen || '') + '|' + moves.join(' ');
  if (GS_CACHE.key === key) return GS_CACHE.v;
  const R = CH.replay(moves, g.startFen);
  const st = CH.status(R.pos);
  const v = { pos: R.pos, san: R.san, moves: R.moves, st };
  GS_CACHE = { key, v };
  return v;
}
const turnOf = g => gstate(g).pos.turn;
const sideName = (g, c) => c === 0 ? g.white : g.black;
const machineSide = g => g.mode === 'ai' ? 1 - g.human : -1;
const isMachineTurn = g => g.mode === 'ai' && !g.result && turnOf(g) === machineSide(g);
const levelLabel = l => '🤖 ' + (LEVELS[l] ? 'Nivel ' + l + ' · ' + LEVELS[l].name : 'Máquina');

/* ================= Reloj ================= */
function parseClock(v, customMin, customInc) {
  if (!v) return null;
  let m, i;
  if (v === 'custom') { m = Math.max(0.5, Math.min(180, Number(customMin) || 10)); i = Math.max(0, Math.min(60, Math.round(Number(customInc) || 0))); }
  else [m, i] = v.split('+').map(Number);
  return { base: Math.round(m * 60000), inc: i * 1000 };
}
const clockLabel = c => c ? (c.base / 60000).toLocaleString('es-ES') + '+' + c.inc / 1000 : 'Sin reloj';
function remaining(g, c) {
  if (!g.clock) return Infinity;
  const live = !g.result && g.tick && turnOf(g) === c;
  return Math.max(0, g.times[c] - (live ? Date.now() - g.tick : 0));
}
function fmtClock(ms) {
  if (!isFinite(ms)) return '';
  if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1).replace('.', ',');
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
}
// El reloj se para si sales de la app y sigue al volver
function pauseClock() { const g = S.game; if (g && g.clock && g.tick && !g.result) { const c = turnOf(g); g.times[c] = remaining(g, c); g.tick = null; g.paused = true; save(); } }
function resumeClock() { const g = S.game; if (g && g.clock && g.paused && !g.result) { g.paused = false; if (g.moves.length) g.tick = Date.now(); save(); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pauseClock(); else { resumeClock(); if (S.game && !REVIEW && !S.pz) render(); } });
let clockTimer = null;
function clockLoop() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const g = S.game;
    if (!g || !g.clock || g.result || REVIEW || S.pz) return;
    for (const c of [0, 1]) document.querySelectorAll(`[data-clock="${c}"]`).forEach(el => { const r = remaining(g, c); el.textContent = fmtClock(r); el.classList.toggle('low', r < 20000); el.classList.toggle('run', !!g.tick && turnOf(g) === c); });
    const c = turnOf(g);
    if (g.tick && remaining(g, c) <= 0) {
      g.times[c] = 0;
      const pos = gstate(g).pos;
      endGame(pos.canMate(1 - c) ? (c === 0 ? '0-1' : '1-0') : '1/2-1/2', 'tiempo');
    }
  }, 200);
}

/* ================= Tablero ================= */
const BS = { sel: null, drag: null };
let ANIM = null;          // jugada a animar en el próximo dibujo
function boardColors() { const b = BOARDS[S.board] || BOARDS.madera; return `--sql:${b.l};--sqd:${b.d}`; }
// o: { pos, orient, last:[from,to], sel, targets:[sq], hint:[sq], best:[sq], check, coords }
function boardHtml(o) {
  let sqs = '', pcs = '';
  const tset = new Set(o.targets || []), hset = new Set(o.hint || []), bset = new Set(o.best || []);
  const last = o.last || [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const rank = o.orient ? r : 7 - r, file = o.orient ? 7 - f : f, sq = rank * 16 + file;
    const light = (rank + file) % 2 === 1;
    const p = o.pos.b[sq];
    let cls = 'sq ' + (light ? 'l' : 'd');
    if (last.includes(sq)) cls += ' last';
    if (o.sel === sq) cls += ' sel';
    if (tset.has(sq)) cls += p ? ' tcap' : ' tgt';
    if (hset.has(sq)) cls += ' hint';
    if (bset.has(sq)) cls += ' best';
    if (o.check === sq) cls += ' chk';
    let co = '';
    if (S.coords !== false) {
      if (f === 0) co += `<b class="cr">${rank + 1}</b>`;
      if (r === 7) co += `<b class="cf">${'abcdefgh'[file]}</b>`;
    }
    sqs += `<div class="${cls}" style="left:${f * 12.5}%;top:${r * 12.5}%">${co}</div>`;
    if (p) pcs += `<div class="pc" data-at="${sq}" style="left:${f * 12.5}%;top:${r * 12.5}%">${Piezas.piece(p & 7, p >> 3)}</div>`;
  }
  return sqs + pcs;
}
function screenXY(sq, orient) { const rank = sq >> 4, file = sq & 7; return orient ? [7 - file, rank] : [file, 7 - rank]; }
function animate(el, orient) {
  if (!ANIM || !el) return;
  const list = ANIM; ANIM = null;
  for (const [from, to] of list) {
    const pc = el.querySelector(`.pc[data-at="${to}"]`); if (!pc) continue;
    const [x1, y1] = screenXY(from, orient), [x2, y2] = screenXY(to, orient);
    pc.style.transition = 'none'; pc.style.transform = `translate(${(x1 - x2) * 100}%,${(y1 - y2) * 100}%)`; pc.style.zIndex = 3;
    pc.getBoundingClientRect();
    pc.style.transition = 'transform .18s ease-out'; pc.style.transform = '';
    setTimeout(() => { pc.style.zIndex = ''; }, 220);
  }
}
function animFor(pos, uci) {
  const from = CH.sqParse(uci.slice(0, 2)), to = CH.sqParse(uci.slice(2, 4));
  const list = [[from, to]];
  const p = pos.b[from];
  if ((p & 7) === CH.KING && Math.abs((to & 7) - (from & 7)) === 2) { const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1; list.push([rf, rt]); }
  return list;
}
// ctl: { pos, orient, canPick(sq), onMove(uci) }
function bindBoard(el, ctl) {
  const sqAt = (x, y) => {
    const r = el.getBoundingClientRect();
    const f = Math.floor((x - r.left) / r.width * 8), rr = Math.floor((y - r.top) / r.height * 8);
    if (f < 0 || f > 7 || rr < 0 || rr > 7) return -1;
    return ctl.orient ? rr * 16 + (7 - f) : (7 - rr) * 16 + f;
  };
  const targetsOf = sq => ctl.pos.legal().filter(m => CH.mFrom(m) === sq);
  const tryMove = (from, to) => {
    const ms = targetsOf(from).filter(m => CH.mTo(m) === to);
    if (!ms.length) return false;
    if (ms.length > 1) { askPromotion(ctl.pos.turn, pr => { const m = ms.find(x => CH.mPromo(x) === pr) || ms[0]; BS.sel = null; ctl.onMove(ctl.pos.uci(m)); }, () => { BS.sel = null; ctl.redraw(); }); return true; }
    BS.sel = null; ctl.onMove(ctl.pos.uci(ms[0])); return true;
  };
  el.onpointerdown = e => {
    if (e.button > 0) return;
    const sq = sqAt(e.clientX, e.clientY); if (sq < 0) return;
    if (BS.sel != null && BS.sel !== sq && targetsOf(BS.sel).some(m => CH.mTo(m) === sq)) { e.preventDefault(); tryMove(BS.sel, sq); return; }
    if (ctl.canPick(sq)) {
      e.preventDefault();
      const was = BS.sel === sq;
      BS.sel = sq; ctl.redraw();
      const pc = el.querySelector(`.pc[data-at="${sq}"]`);
      BS.drag = { sq, x: e.clientX, y: e.clientY, pc, on: false, was };
      try { el.setPointerCapture(e.pointerId); } catch (er) {}
    } else if (BS.sel != null) { BS.sel = null; ctl.redraw(); }
  };
  el.onpointermove = e => {
    const d = BS.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.on = true; if (d.pc) d.pc.classList.add('drag'); }
    if (d.on && d.pc) d.pc.style.transform = `translate(${e.clientX - d.x}px,${e.clientY - d.y}px) scale(1.15)`;
  };
  el.onpointerup = e => {
    const d = BS.drag; BS.drag = null; if (!d) return;
    if (d.on) {
      const to = sqAt(e.clientX, e.clientY);
      if (d.pc) { d.pc.classList.remove('drag'); d.pc.style.transform = ''; }
      if (to >= 0 && to !== d.sq && tryMove(d.sq, to)) return;
      ctl.redraw();
    } else if (d.was) { BS.sel = null; ctl.redraw(); }
  };
  el.onpointercancel = () => { const d = BS.drag; BS.drag = null; if (d && d.pc) { d.pc.classList.remove('drag'); d.pc.style.transform = ''; } };
}
function askPromotion(color, done, cancel) {
  openModal(`<h3>Coronar</h3><div class="sub">Elige la pieza.</div>
    <div class="promo">${[5, 4, 3, 2].map(t => `<button data-pr="${t}" aria-label="${PNAME[t]}">${Piezas.piece(t, color)}<span>${PNAME[t]}</span></button>`).join('')}</div>
    <div class="acts"><button class="btn-ghost" id="prNo">Cancelar</button></div>`);
  modalOnClose = cancel;
  document.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => { modalOnClose = null; closeModal(); done(+b.dataset.pr); });
  $('#prNo').onclick = () => closeModal();
}
// Piezas capturadas y diferencia de material
function captured(pos) {
  const start = [0, 8, 2, 2, 2, 1, 1], have = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = pos.b[s]; if (p) have[p >> 3][p & 7]++; }
  const V = [0, 1, 3, 3, 5, 9, 0];
  const lost = [[], []]; let mat = [0, 0];
  for (const c of [0, 1]) for (let t = 5; t >= 1; t--) { const n = Math.max(0, start[t] - have[c][t]); for (let i = 0; i < n; i++) lost[c].push(t); mat[c] += have[c][t] * V[t]; }
  return { lost, diff: mat[0] - mat[1] };
}

/* ================= Pantalla de inicio ================= */
function modeTabs() {
  const m = S.draft.mode;
  return `<div class="kinds modes">${[['ai', '🤖 Contra la máquina'], ['local', '👥 Dos jugadores'], ['puzzles', '🧩 Problemas']].map(([k, l]) => `<button data-mode="${k}" class="${m === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function clockFields(c, prefix) {
  return `<div class="chips">${CLOCKS.map(([k, l]) => `<button class="chipb ${(c.clock || '') === k ? 'on' : ''}" data-${prefix}clock="${k}">${l}</button>`).join('')}</div>
    ${c.clock === 'custom' ? `<div class="row" style="margin-bottom:6px"><label class="f" style="border:0"><span>Minutos</span><input type="number" inputmode="decimal" min="0.5" max="180" step="0.5" id="${prefix}cMin" value="${esc(c.cMin || 10)}"></label>
      <label class="f" style="border:0"><span>Incremento (s)</span><input type="number" inputmode="numeric" min="0" max="60" id="${prefix}cInc" value="${esc(c.cInc || 0)}"></label></div>` : ''}
    <div class="mut">${c.clock ? 'Minutos por jugador + segundos que se suman en cada jugada. El reloj se para si sales de la app.' : 'Sin límite de tiempo.'}</div>`;
}
function rosterChips(cur, attr) {
  if (!S.roster.length) return '';
  return `<div class="chips">${rosterSorted().map(n => `<button class="chipb ${cur.some(x => nkey(x) === nkey(n)) ? 'on' : ''}" data-${attr}="${esc(n)}">${esc(n)}</button>`).join('')}
    <button class="chipb" data-manage="1" style="border-style:dashed">👥 Gestionar</button></div>`;
}
function renderSetup() {
  const d = S.draft;
  $('#subtitle').textContent = d.mode === 'puzzles' ? 'Problemas y repaso de errores' : d.mode === 'local' ? 'Dos jugadores' : 'Contra la máquina';
  let body = '';
  if (d.mode === 'puzzles') body = puzzlesHtml();
  else if (d.mode === 'local') {
    const L = d.local;
    body = `<div class="sec plist"><h2>Jugadores</h2>
      ${S.roster.length ? '<div class="mut" style="margin-bottom:6px">Toca los habituales para ponerlos:</div>' + rosterChips([L.white, L.black], 'lchip') : ''}
      <div class="pr"><span class="side">${Piezas.piece(6, 0)}</span><input type="text" maxlength="18" id="lWhite" placeholder="Blancas" value="${esc(L.white)}" autocomplete="off" list="rosterList"></div>
      <div class="pr"><span class="side">${Piezas.piece(6, 1)}</span><input type="text" maxlength="18" id="lBlack" placeholder="Negras" value="${esc(L.black)}" autocomplete="off" list="rosterList">
        <button id="lSwap" aria-label="Cambiar colores" title="Cambiar colores">⇅</button></div>
      <datalist id="rosterList">${S.roster.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="sec"><h2>Reloj</h2>${clockFields(L, 'l')}</div>
      <div class="sec"><h2>Tablero</h2>
        <label class="f"><span>Girar el tablero en cada turno<em>Para jugar uno frente a otro con el móvil en la mesa, mejor desactivado</em></span><input type="checkbox" class="tg" id="lFlip" ${L.flip ? 'checked' : ''}></label></div>`;
  } else {
    const A2 = d.ai;
    body = `<div class="sec plist"><h2>Tu nombre</h2>
      ${S.roster.length ? rosterChips([A2.name], 'achip') : ''}
      <input type="text" maxlength="18" id="aName" placeholder="Tú" value="${esc(A2.name)}" autocomplete="off" list="rosterList" style="width:100%">
      <datalist id="rosterList">${S.roster.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="mut" style="margin-top:6px">Con tu nombre, las partidas cuentan para tu Elo en la clasificación.</div></div>
      <div class="sec"><h2>Juegas con</h2><div class="kinds">${[['0', Piezas.piece(6, 0) + 'Blancas'], ['1', Piezas.piece(6, 1) + 'Negras'], ['r', '🎲 Al azar']].map(([k, l]) => `<button class="colbtn ${String(A2.color) === k ? 'on' : ''}" data-acolor="${k}">${l}</button>`).join('')}</div></div>
      <div class="sec"><h2>Nivel</h2><div class="levels">${LEVELS.slice(1).map((L, i) => `<button class="lvl ${A2.level === i + 1 ? 'on' : ''}" data-alevel="${i + 1}"><b>${i + 1}</b><span>${esc(L.name)}<em>${esc(LEVEL_DESC[i + 1])}</em></span><small>≈${L.elo}</small></button>`).join('')}</div></div>
      <div class="sec"><h2>Reloj</h2>${clockFields(A2, 'a')}</div>
      <div class="sec"><h2>Ayuda</h2><label class="f"><span>Modo aprendizaje<em>Botón de pista y aviso cuando una jugada pierde material (puedes deshacerla o seguir)</em></span><input type="checkbox" class="tg" id="aLearn" ${A2.learn ? 'checked' : ''}></label></div>`;
  }
  $('#app').innerHTML = `${modeTabs()}${body}
    ${d.mode !== 'puzzles' && S.archive.length ? `<div class="sec"><h2>Partidas anteriores</h2>${archiveHtml(3)}<button class="btn-ghost" id="allArch" style="width:100%;margin-top:4px">Ver clasificación y todas</button></div>` : ''}
    <div class="copy">© 2026 IT Canarias. Todos los derechos reservados.</div>
    ${d.mode !== 'puzzles' ? '<button class="btn-gold fab" id="start">Empezar partida</button>' : ''}`;
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { syncDraft(); d.mode = b.dataset.mode; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-manage]').forEach(b => b.onclick = () => { syncDraft(); openRoster(); });
  document.querySelectorAll('[data-arch]').forEach(el => el.onclick = () => openGameReview(S.archive[+el.dataset.arch], 'home'));
  const allA = $('#allArch'); if (allA) allA.onclick = () => openArchive('ranking');
  if (d.mode === 'puzzles') return bindPuzzles();
  const pre = d.mode === 'local' ? 'l' : 'a', cfg = d.mode === 'local' ? d.local : d.ai;
  document.querySelectorAll(`[data-${pre}clock]`).forEach(b => b.onclick = () => { syncDraft(); cfg.clock = b.dataset[pre + 'clock']; render(); });
  if (d.mode === 'local') {
    document.querySelectorAll('[data-lchip]').forEach(b => b.onclick = () => {
      syncDraft(); const n = b.dataset.lchip, L = d.local;
      if (nkey(L.white) === nkey(n)) L.white = ''; else if (nkey(L.black) === nkey(n)) L.black = '';
      else if (!L.white.trim()) L.white = n; else if (!L.black.trim()) L.black = n; else L.black = n;
      render();
    });
    $('#lSwap').onclick = () => { syncDraft(); const L = d.local; [L.white, L.black] = [L.black, L.white]; render(); };
  } else {
    document.querySelectorAll('[data-achip]').forEach(b => b.onclick = () => { syncDraft(); d.ai.name = nkey(d.ai.name) === nkey(b.dataset.achip) ? '' : b.dataset.achip; render(); });
    document.querySelectorAll('[data-acolor]').forEach(b => b.onclick = () => { syncDraft(); d.ai.color = b.dataset.acolor === 'r' ? 'r' : +b.dataset.acolor; render(); });
    document.querySelectorAll('[data-alevel]').forEach(b => b.onclick = () => { syncDraft(); d.ai.level = +b.dataset.alevel; render(); });
  }
  document.querySelectorAll('#app input').forEach(el => el.addEventListener('change', () => { syncDraft(); save(); }));
  $('#start').onclick = () => { syncDraft(); startGame(); };
}
function syncDraft() {
  const d = S.draft, v = id => { const el = $('#' + id); return el ? el.value : null; }, ck = id => { const el = $('#' + id); return el ? el.checked : null; };
  if (d.mode === 'local') {
    if (v('lWhite') != null) d.local.white = v('lWhite');
    if (v('lBlack') != null) d.local.black = v('lBlack');
    if (ck('lFlip') != null) d.local.flip = ck('lFlip');
    if (v('lcMin') != null) { d.local.cMin = v('lcMin'); d.local.cInc = v('lcInc'); }
  } else if (d.mode === 'ai') {
    if (v('aName') != null) d.ai.name = v('aName');
    if (ck('aLearn') != null) d.ai.learn = ck('aLearn');
    if (v('acMin') != null) { d.ai.cMin = v('acMin'); d.ai.cInc = v('acInc'); }
  }
  save();
}
function canonName(n, def) { const t = cleanName(n); if (!t) return def; const r = S.roster.find(x => nkey(x) === nkey(t)); return r || t; }
function remember(n) { if (n && !isPlaceholder(n) && !S.roster.some(x => nkey(x) === nkey(n))) S.roster.push(n); }
function startGame(o) {
  const d = S.draft;
  if (!o) {
    if (d.mode === 'local') {
      const L = d.local, w = canonName(L.white, 'Blancas'), b = canonName(L.black, 'Negras');
      if (nkey(w) === nkey(b)) { toast('Los dos jugadores tienen el mismo nombre'); return; }
      o = { mode: 'local', white: w, black: b, clock: parseClock(L.clock, L.cMin, L.cInc), flip: !!L.flip };
      remember(w); remember(b);
    } else {
      const A2 = d.ai, name = canonName(A2.name, 'Tú');
      const human = A2.color === 'r' ? (Math.random() < 0.5 ? 0 : 1) : (A2.color ? 1 : 0);
      o = { mode: 'ai', human, level: A2.level, name, clock: parseClock(A2.clock, A2.cMin, A2.cInc), learn: !!A2.learn };
      remember(name);
    }
  }
  const g = { id: uid(), created: Date.now(), mode: o.mode, moves: [], startFen: o.startFen || null, clock: o.clock || null, result: null, reason: '', undos: 0, hints: 0 };
  if (o.mode === 'ai') Object.assign(g, { human: o.human, level: o.level, learn: !!o.learn, white: o.human === 0 ? o.name : levelLabel(o.level), black: o.human === 1 ? o.name : levelLabel(o.level) });
  else Object.assign(g, { white: o.white, black: o.black, flip: !!o.flip });
  if (g.clock) { g.times = [g.clock.base, g.clock.base]; g.tick = null; }
  S.game = g; REVIEW = null; S.pz = null; S.drill = null; BS.sel = null; VIEW_PLY = null; HINT = null; LEARN_WAIT = null;
  keepAwake(); render();
}
function rematch() {
  const g = S.game; if (!g) return;
  if (g.mode === 'ai') startGame({ mode: 'ai', human: 1 - g.human, level: g.level, name: g.human === 0 ? g.white : g.black, clock: g.clock, learn: g.learn, startFen: g.startFen });
  else startGame({ mode: 'local', white: g.black, black: g.white, clock: g.clock, flip: g.flip, startFen: g.startFen });
}

/* ================= Partida en curso ================= */
let VIEW_PLY = null;      // viendo una jugada anterior (null = posición actual)
let THINK = null;         // la máquina está pensando
let HINT = null;          // casillas de la pista
let LEARN_WAIT = null;    // modo aprendizaje: esperando a que decidas
function orientOf(g) {
  let o = g.mode === 'ai' ? g.human : (g.flip && !g.result ? turnOf(g) : 0);
  if (g.rot) o = 1 - o;
  return o;
}
function playerBar(g, c, pos) {
  const cap = captured(pos), lost = cap.lost[1 - c];     // piezas que ha capturado c
  const adv = c === 0 ? cap.diff : -cap.diff;
  const turn = !g.result && pos.turn === c;
  const thinking = THINK && machineSide(g) === c;
  return `<div class="pbar ${turn ? 'turn' : ''}">
    <span class="pk">${Piezas.piece(6, c)}</span>
    <div class="pn"><b>${esc(sideName(g, c))}</b><span class="caps">${lost.map(t => `<i>${Piezas.piece(t, 1 - c)}</i>`).join('')}${adv > 0 ? `<em>+${adv}</em>` : ''}${thinking ? '<em class="think">pensando…</em>' : ''}</span></div>
    ${g.clock ? `<span class="clock ${remaining(g, c) < 20000 && !g.result ? 'low' : ''} ${turn && g.tick ? 'run' : ''}" data-clock="${c}">${fmtClock(remaining(g, c))}</span>` : ''}
  </div>`;
}
function movesStrip(san, cur, startPos) {
  const sp = startPos || new CH.Position();
  let n = sp.full, w = sp.turn === 0, h = '';
  san.forEach((s, i) => {
    if (w) h += `<span class="mn">${n}.</span>`; else if (i === 0) h += `<span class="mn">${n}…</span>`;
    h += `<button class="mv ${cur === i + 1 ? 'on' : ''}" data-ply="${i + 1}">${esc(CH.sanEs(s))}</button>`;
    if (!w) n++; w = !w;
  });
  return h || '<span class="mut">Aún no hay jugadas.</span>';
}
// Nombre de la apertura (solo si la partida empezó desde la posición inicial)
function openingName(g, ply) { return g.startFen || !window.Aperturas ? '' : Aperturas.aperturaDe(g.moves.slice(0, ply == null ? g.moves.length : ply)); }
function openingLine(g, ply) { const n = openingName(g, ply); return n ? `<div class="opening">📖 ${esc(n)}</div>` : ''; }
function statusText(g, R) {
  if (g.result) {
    const why = CH.REASONS[g.reason] || '';
    if (g.mode === 'ai') {
      const won = (g.result === '1-0' && g.human === 0) || (g.result === '0-1' && g.human === 1);
      return (g.result === '1/2-1/2' ? '🤝 Tablas' : won ? '🏆 ¡Has ganado!' : '😔 Gana la máquina') + (why ? ' · ' + why : '');
    }
    return (g.result === '1/2-1/2' ? '🤝 Tablas' : '🏆 Ganan ' + (g.result === '1-0' ? g.white : g.black)) + (why ? ' · ' + why : '');
  }
  const c = R.pos.turn;
  if (THINK) return '🤖 La máquina está pensando…';
  if (LEARN_WAIT) return '🔎 Comprobando tu jugada…';
  let t = g.mode === 'ai' ? (c === g.human ? 'Te toca' : 'Juega la máquina') : 'Juegan ' + (c === 0 ? 'blancas' : 'negras') + ' · ' + sideName(g, c);
  if (R.st.check) t = '♚ ¡Jaque! ' + t;
  return t;
}
function renderGame() {
  const g = S.game;
  const R = gstate(g);
  const viewing = VIEW_PLY != null && VIEW_PLY < g.moves.length;
  const V = viewing ? CH.replay(g.moves.slice(0, VIEW_PLY), g.startFen) : null;
  const pos = viewing ? V.pos : R.pos;
  const orient = orientOf(g);
  const lastUci = viewing ? g.moves[VIEW_PLY - 1] : g.moves[g.moves.length - 1];
  const last = lastUci ? [CH.sqParse(lastUci.slice(0, 2)), CH.sqParse(lastUci.slice(2, 4))] : [];
  const st = viewing ? CH.status(pos) : R.st;
  const myTurn = !g.result && !viewing && !THINK && !LEARN_WAIT && (g.mode === 'local' || pos.turn === g.human);
  const targets = BS.sel != null && myTurn ? pos.legal().filter(m => CH.mFrom(m) === BS.sel).map(m => CH.mTo(m)) : [];
  $('#subtitle').textContent = g.mode === 'ai' ? levelLabel(g.level).replace('🤖 ', '') + (g.clock ? ' · ' + clockLabel(g.clock) : '') : 'Dos jugadores' + (g.clock ? ' · ' + clockLabel(g.clock) : '');
  const top = 1 - orient, bottom = orient;
  const acts = g.result
    ? `<button class="btn-gold" id="gAnalyse">🔍 Analizar</button><button id="gRematch">↻ Revancha</button><button id="gNew">✚ Nueva</button><button id="gShare">📤 Compartir</button>`
    : `<button id="gUndo" ${g.moves.length ? '' : 'disabled'}>↶ Deshacer</button><button id="gDraw" ${g.moves.length >= 2 ? '' : 'disabled'}>½ Tablas</button><button id="gResign">🏳 Rendirse</button><button id="gFlip" aria-label="Girar tablero">⇅</button>`;
  $('#app').innerHTML = `<div class="gm">
    <div class="gb">
      ${playerBar(g, top, R.pos)}
      <div class="board" id="board" style="${boardColors()}">${boardHtml({ pos, orient, last, sel: myTurn ? BS.sel : null, targets, hint: HINT || [], check: st.check ? pos.kings[pos.turn] : -1 })}</div>
      ${playerBar(g, bottom, R.pos)}
    </div>
    <div class="gs">
      <div class="sidebars">${playerBar(g, top, R.pos)}${playerBar(g, bottom, R.pos)}</div>
      <div class="gstatus ${g.result ? 'end' : ''}"><span>${esc(statusText(g, R))}</span>${!g.result && g.mode === 'ai' && g.learn ? '<button id="gHint">💡 Pista</button>' : ''}</div>
      ${viewing ? `<button class="viewing" id="gLive">Viendo la jugada ${VIEW_PLY} · <u>Volver a la partida</u></button>` : ''}
      ${openingLine(g, viewing ? VIEW_PLY : g.moves.length)}
      <div class="moves" id="moves">${movesStrip(R.san, viewing ? VIEW_PLY : g.moves.length, g.startFen ? new CH.Position(g.startFen) : null)}</div>
      <div class="gacts">${acts}</div>
    </div></div>`;
  const ms = $('#moves'); if (ms) { const on = ms.querySelector('.mv.on'); if (on && on.scrollIntoView) ms.scrollLeft = on.offsetLeft - ms.clientWidth / 2; }
  const bd = $('#board');
  animate(bd, orient);
  bindBoard(bd, { pos, orient, canPick: sq => myTurn && pos.b[sq] && (pos.b[sq] >> 3) === pos.turn, onMove: humanMove, redraw: renderGame });
  document.querySelectorAll('#moves [data-ply]').forEach(b => b.onclick = () => { const p = +b.dataset.ply; VIEW_PLY = p >= g.moves.length ? null : p; BS.sel = null; renderGame(); });
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('gLive', () => { VIEW_PLY = null; renderGame(); });
  on('gUndo', undoMove);
  on('gHint', showHint);
  on('gDraw', offerDraw);
  on('gResign', resign);
  on('gFlip', () => { g.rot = !g.rot; save(); renderGame(); });
  on('gAnalyse', () => openGameReview(g, 'game', true));
  on('gRematch', rematch);
  on('gNew', () => { S.game = null; REVIEW = null; render(); });
  on('gShare', () => sharePgn(g));
  clockLoop();
  if (isMachineTurn(g) && !THINK && !LEARN_WAIT) machineMove();
}
function humanMove(uci) {
  const g = S.game; if (!g || g.result) return;
  const before = gstate(g).pos;
  HINT = null;
  const learn = g.mode === 'ai' && g.learn;
  if (learn) LEARN_WAIT = uid();
  applyMove(g, uci, before);
  if (learn) { if (g.result) LEARN_WAIT = null; else learnCheck(g, g.moves.length, LEARN_WAIT); }
}
function applyMove(g, uci, before) {
  const c = before.turn;
  if (g.clock && !g.result) {
    if (g.tick) g.times[c] = remaining(g, c);
    if (g.moves.length || c === 1) g.times[c] += g.clock.inc;
    g.tick = Date.now(); g.paused = false;
  }
  ANIM = animFor(before, uci);
  Sound.play(Sound.forMove(before, uci));
  g.moves.push(uci);
  VIEW_PLY = null; BS.sel = null;
  vibrate(12);
  const R = gstate(g);
  if (R.st.over) endGame(R.st.result, R.st.reason);
  else { save(); render(); }
}
function endGame(result, reason) {
  const g = S.game; if (!g || g.result) return;
  if (g.clock && g.tick) { const c = turnOf(g); g.times[c] = remaining(g, c); }
  g.result = result; g.reason = reason; g.finished = Date.now(); g.tick = null;
  THINK = null; LEARN_WAIT = null; HINT = null; Engine.reset();
  archiveUpsert(g);
  setTimeout(() => Sound.play('end'), 250);
  vibrate([30, 60, 30]);
  save(); render(); autoBackup(true);
}
function archiveUpsert(g) {
  const copy = JSON.parse(JSON.stringify(g)); delete copy.tick; delete copy.paused; delete copy.rot;
  const i = S.archive.findIndex(a => a.id === g.id);
  if (i >= 0) S.archive[i] = copy; else S.archive.unshift(copy);
  if (S.archive.length > MAX_ARCHIVE) S.archive.length = MAX_ARCHIVE;
}
async function machineMove() {
  const g = S.game; if (!isMachineTurn(g) || THINK || LEARN_WAIT) return;
  const tok = THINK = uid();
  setTimeout(() => { if (THINK === tok && S.game === g && !REVIEW && !S.pz && $('#modal').classList.contains('hidden')) render(); }, 230);
  const L = LEVELS[g.level] || LEVELS[3];
  let timeMs = L.time || 0;
  if (g.clock && timeMs) timeMs = Math.max(150, Math.min(timeMs, remaining(g, machineSide(g)) / 40));
  const t0 = Date.now();
  let r = null;
  try { r = await Engine.call({ op: 'move', moves: g.moves, startFen: g.startFen, level: g.level, timeMs }); }
  catch (e) { try { r = MO.handle({ op: 'move', moves: g.moves, startFen: g.startFen, level: g.level, timeMs: 200 }); } catch (e2) { r = null; } }
  const wait = Math.max(0, 450 - (Date.now() - t0));
  await new Promise(res => setTimeout(res, wait));
  if (THINK !== tok || S.game !== g || g.result) return;
  THINK = null;
  if (!r || !r.move) { render(); return; }
  const before = gstate(g).pos;
  if (!before.fromUci(r.move)) { render(); return; }
  applyMove(g, r.move, before);
}
// Modo aprendizaje: si tu jugada pierde mucho, te avisa antes de que juegue la máquina
async function learnCheck(g, n, tok) {
  let before, after;
  try {
    [before, after] = await Promise.all([
      Engine.call({ op: 'best', moves: g.moves.slice(0, n - 1), startFen: g.startFen, timeMs: 350 }),
      Engine.call({ op: 'best', moves: g.moves.slice(0, n), startFen: g.startFen, timeMs: 350 })]);
  } catch (e) { before = after = null; }
  if (LEARN_WAIT !== tok || S.game !== g) return;
  const bs = before ? MO.capScore(before.score) : 0, as = after ? -MO.capScore(after.score) : 0;
  const loss = bs - as;
  if (!before || !after || loss < 150 || before.move === g.moves[n - 1]) { LEARN_WAIT = null; render(); return; }
  const p = CH.replay(g.moves.slice(0, n - 1), g.startFen).pos;
  const best = p.fromUci(before.move) ? CH.sanEs(p.san(p.fromUci(before.move))) : before.move;
  openModal(`<h3>⚠️ ¿Seguro?</h3><div class="sub">Esa jugada te hace perder ventaja (unos ${fmtPawns(loss)} peones${as < -300 ? ', y la posición queda difícil' : ''}).<br>Una jugada mejor era <b>${esc(best)}</b>.</div>
    <div class="acts"><button class="btn-ghost" id="lnUndo">↶ Deshacer</button><button class="btn-gold" id="lnGo">Seguir así</button></div>`);
  // cerrar la ventana de cualquier forma (fuera, atrás) equivale a «Seguir así»
  modalOnClose = () => { LEARN_WAIT = null; render(); };
  $('#lnGo').onclick = () => closeModal();
  $('#lnUndo').onclick = () => { modalOnClose = null; closeModal(); LEARN_WAIT = null; if (S.game === g && g.moves.length === n) { g.moves.pop(); g.undos = (g.undos || 0) + 1; } save(); render(); };
}
const fmtPawns = cp => (Math.round(Math.abs(cp) / 10) / 10).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function undoMove() {
  const g = S.game; if (!g || g.result || !g.moves.length) return;
  if (THINK) { THINK = null; Engine.reset(); }
  LEARN_WAIT = null; HINT = null;
  if (g.mode === 'ai') {
    if (turnOf(g) === g.human && g.moves.length >= 2) g.moves.splice(-2);
    else g.moves.pop();
    if (turnOf(g) !== g.human && g.moves.length) g.moves.pop();
  } else g.moves.pop();
  g.undos = (g.undos || 0) + 1;
  if (g.clock && g.tick) g.tick = Date.now();
  BS.sel = null; VIEW_PLY = null;
  save(); render(); toast('Jugada deshecha');
}
async function showHint() {
  const g = S.game; if (!g || g.result || isMachineTurn(g)) return;
  toast('Buscando una buena jugada…');
  let r; try { r = await Engine.call({ op: 'best', moves: g.moves, startFen: g.startFen, timeMs: 800 }); } catch (e) { return; }
  if (S.game !== g || !r || !r.move || g.result) return;
  const pos = gstate(g).pos, m = pos.fromUci(r.move); if (!m) return;
  HINT = [CH.mFrom(m), CH.mTo(m)]; g.hints = (g.hints || 0) + 1; save();
  render(); toast('💡 Prueba ' + CH.sanEs(pos.san(m)));
}
async function offerDraw() {
  const g = S.game; if (!g || g.result) return;
  if (g.mode === 'local') {
    const other = turnOf(g) === 0 ? 1 : 0;
    confirmBox('Ofrecer tablas', `¿Aceptan las ${COLOR_TXT[other]} (${sideName(g, other)}) las tablas?`, 'Aceptar tablas', () => endGame('1/2-1/2', 'acuerdo'));
    return;
  }
  if (isMachineTurn(g)) { toast('Espera a que juegue la máquina'); return; }
  toast('La máquina lo está pensando…');
  let r; try { r = await Engine.call({ op: 'best', moves: g.moves, startFen: g.startFen, timeMs: 600 }); } catch (e) { r = null; }
  if (S.game !== g || g.result) return;
  const mine = r ? -r.score : 0;      // desde el punto de vista de la máquina
  if (mine <= -40 || (Math.abs(mine) <= 40 && g.moves.length >= 60)) { toast('🤝 La máquina acepta las tablas'); endGame('1/2-1/2', 'acuerdo'); }
  else toast('🤖 La máquina prefiere seguir jugando');
}
function resign() {
  const g = S.game; if (!g || g.result) return;
  if (g.mode === 'ai') { confirmBox('Rendirse', 'La partida contará como perdida.', 'Me rindo', () => endGame(g.human === 0 ? '0-1' : '1-0', 'abandono'), true); return; }
  openModal(`<h3>🏳 Rendirse</h3><div class="sub">¿Quién se rinde?</div><div class="menu">
    <button id="rsW">${esc(g.white)} (blancas)</button><button id="rsB">${esc(g.black)} (negras)</button></div>
    <div class="acts"><button class="btn-ghost" id="rsNo">Cancelar</button></div>`);
  $('#rsNo').onclick = closeModal;
  $('#rsW').onclick = () => { closeModal(); endGame('0-1', 'abandono'); };
  $('#rsB').onclick = () => { closeModal(); endGame('1-0', 'abandono'); };
}

/* ================= PGN ================= */
function gamePgnData(g) {
  const d = new Date(g.created || Date.now());
  return { moves: g.moves, startFen: g.startFen, white: g.white, black: g.black, result: g.result || '*', created: g.created,
    event: g.event || (g.mode === 'ai' ? 'Partida contra la máquina' : g.mode === 'local' ? 'Partida amistosa' : 'Partida'),
    site: g.site, date: g.date, round: g.round,
    timeControl: g.clock ? (g.clock.base / 1000) + '+' + (g.clock.inc / 1000) : null,
    termination: g.reason ? (CH.REASONS[g.reason] || g.reason) : null };
}
const toPgn = g => CH.toPgn(gamePgnData(g));
async function shareText(text, title, fileName) {
  try {
    if (isNative() && fileName) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const r = await Filesystem.writeFile({ path: fileName, data: text, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title, text: fileName.endsWith('.pgn') ? title : text, files: [r.uri], dialogTitle: title });
      return;
    }
    if (navigator.share) { await navigator.share({ title, text }); return; }
    if (fileName) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' })); a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Archivo descargado'); return;
    }
    await navigator.clipboard.writeText(text); toast('Copiado');
  } catch (e) { if (!/cancel|abort/i.test(String(e && (e.message || e.name)))) toast('No se pudo compartir'); }
}
function sharePgn(g) {
  const txt = toPgn(g);
  openModal(`<h3>📤 Compartir la partida</h3><div class="sub">${esc(g.white)} – ${esc(g.black)} · ${esc(g.result || '*')}</div>
    <pre class="pgn">${esc(txt)}</pre>
    <div class="menu"><button class="btn-gold" id="shF">📄 Enviar archivo PGN</button><button id="shT">💬 Enviar como texto</button><button id="shC">📋 Copiar</button></div>
    <div class="acts"><button class="btn-ghost" id="shX">Cerrar</button></div>`);
  $('#shX').onclick = closeModal;
  const name = 'ajedrez-' + new Date(g.created || Date.now()).toISOString().slice(0, 10) + '-' + g.id + '.pgn';
  $('#shF').onclick = () => shareText(txt, 'Partida de ajedrez', name);
  $('#shT').onclick = () => shareText(txt, 'Partida de ajedrez');
  $('#shC').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch (e) { toast('No se pudo copiar'); } };
}
function exportAllPgn() {
  const list = S.archive.filter(a => a.result);
  if (!list.length) { toast('No hay partidas terminadas'); return; }
  const txt = list.slice().reverse().map(toPgn).join('\n');
  const d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  shareText(txt, 'Partidas de ajedrez (' + list.length + ')', 'ajedrez-partidas-' + stamp + '.pgn');
}
// Importa partidas desde un archivo PGN (se guardan en el historial pero no cuentan para el Elo)
function importPgn() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pgn,application/x-chess-pgn,text/plain,application/vnd.chess-pgn';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => importPgnText(String(rd.result || ''));
    rd.readAsText(f);
  };
  inp.click();
}
function pgnToGames(text) {
  const parsed = CH.parsePgn(text).slice(0, MAX_ARCHIVE);
  const out = []; let bad = 0;
  for (const p of parsed) {
    if (!p.moves.length && p.error) { bad++; continue; }
    const T = p.tags, R = CH.replay(p.moves, p.startFen);
    const st = CH.status(R.pos);
    let result = /^(1-0|0-1|1\/2-1\/2)$/.test(p.result) ? p.result : st.over ? st.result : null;
    const reason = st.over && result === st.result ? st.reason : (result ? (T.Termination && /time|tiempo/i.test(T.Termination) ? 'tiempo' : '') : '');
    const dm = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(T.Date || '');
    const created = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3], 12).getTime() : Date.now();
    const key = [T.White, T.Black, T.Date, R.moves.join(' ')].join('|');
    out.push({ id: 'p' + hashStr(key), created, finished: created, mode: 'pgn', src: 'pgn', white: cleanName(T.White) || '?', black: cleanName(T.Black) || '?',
      moves: R.moves, startFen: p.startFen, clock: null, result, reason, event: cleanText(T.Event), site: cleanText(T.Site), date: T.Date, round: cleanText(T.Round), error: p.error || null });
    if (p.error) bad++;
  }
  return { games: out, bad };
}
const cleanText = s => s == null ? undefined : String(s).replace(/[<>\u0000-\u001f]/g, '').slice(0, 80);
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function importPgnText(text) {
  const { games, bad } = pgnToGames(text);
  if (!games.length) { toast('No se encontró ninguna partida en ese archivo'); return; }
  const have = new Set(S.archive.map(a => a.id));
  const nuevas = games.filter(g => !have.has(g.id));
  confirmBox('Importar PGN', `${games.length} partida${games.length === 1 ? '' : 's'} en el archivo; ${nuevas.length} nueva${nuevas.length === 1 ? '' : 's'}.${bad ? ' ' + bad + ' con jugadas que no se pudieron leer (se guardan hasta donde se pudo).' : ''} Las partidas importadas se pueden revisar y analizar, pero no cuentan para el Elo.`, 'Importar', () => {
    S.archive = S.archive.concat(nuevas).sort((x, y) => (y.finished || y.created || 0) - (x.finished || x.created || 0)).slice(0, MAX_ARCHIVE);
    save(); toast(nuevas.length + ' partidas importadas'); openArchive('partidas');
  });
}

/* ================= Revisión y análisis ================= */
let REVIEW = null;        // { g, ply, back, analysing, progress, showBest }
function openGameReview(g, back, analyse) {
  if (!g) return;
  closeModal();
  REVIEW = { g, ply: g.moves.length, back: back || 'home', showBest: false };
  render();
  if (analyse && !g.analysis) runAnalysis();
  window.scrollTo(0, 0);
}
function analysisMs(n) { return Math.max(90, Math.min(400, Math.round(14000 / Math.max(1, n + 1)))); }
async function runAnalysis() {
  const RV = REVIEW; if (!RV || RV.analysing) return;
  const g = RV.g;
  RV.analysing = true; RV.progress = 0; render();
  let evals;
  try {
    evals = await Engine.call({ op: 'analyse', moves: g.moves, startFen: g.startFen, timeMs: analysisMs(g.moves.length) }, p => {
      if (REVIEW !== RV) return; RV.progress = p; const b = document.querySelector('.anprog i'); if (b) b.style.width = Math.round(p * 100) + '%';
      const t = document.querySelector('.anprog span'); if (t) t.textContent = 'Analizando… ' + Math.round(p * 100) + '%';
    });
  } catch (e) { evals = null; }
  RV.analysing = false;
  if (!evals) { if (REVIEW === RV) { toast('No se pudo analizar'); render(); } return; }
  g.analysis = { evals: evals.map(e => [e.best || '', e.score]), at: Date.now() };
  // guardar en el historial (y en la partida en curso si es la misma)
  const a = S.archive.find(x => x.id === g.id); if (a && a !== g) a.analysis = g.analysis;
  if (S.game && S.game.id === g.id && S.game !== g) S.game.analysis = g.analysis;
  save();
  if (REVIEW === RV) render();
}
// Clasificación de cada jugada a partir de las evaluaciones
function annotate(g) {
  if (!g.analysis) return null;
  const E = g.analysis.evals, out = [];
  for (let i = 0; i < g.moves.length && i + 1 < E.length; i++) {
    const before = MO.capScore(E[i][1]), after = -MO.capScore(E[i + 1][1]);
    const best = E[i][0], played = g.moves[i];
    const loss = Math.max(0, before - after);
    out.push({ loss, best, cls: MO.classify(loss, best === played), before, after });
  }
  return out;
}
const CLS = { mejor: ['★', 'Mejor jugada', 'c-best'], buena: ['', 'Buena', 'c-good'], imprecision: ['?!', 'Imprecisión', 'c-inac'], error: ['?', 'Error', 'c-err'], grave: ['??', 'Error grave', 'c-blun'] };
function summary(g, ann, startTurn) {
  const s = [0, 1].map(() => ({ n: 0, loss: 0, imprecision: 0, error: 0, grave: 0, mejor: 0 }));
  ann.forEach((a, i) => { const c = (startTurn + i) % 2, o = s[c]; o.n++; o.loss += Math.min(a.loss, 600); if (o[a.cls] != null) o[a.cls]++; });
  s.forEach(o => o.acc = o.n ? Math.round(100 * Math.exp(-(o.loss / o.n) / 160)) : 0);
  return s;
}
function evalText(score, turn) {
  const w = turn === 0 ? score : -score;
  if (Math.abs(score) > MO.MATE_BOUND) { const n = Math.ceil((MO.MATE - Math.abs(score)) / 2); return (w > 0 ? '' : '-') + 'M' + n; }
  return (w > 0 ? '+' : w < 0 ? '−' : '') + fmtPawns(w);
}
function renderReview() {
  const RV = REVIEW, g = RV.g;
  const all = CH.replay(g.moves, g.startFen);
  const startPos = new CH.Position(g.startFen || CH.START_FEN);
  const ply = Math.max(0, Math.min(RV.ply, all.moves.length));
  const ann = annotate(g);
  const showBest = RV.showBest && ann && ply > 0 && ann[ply - 1] && ann[ply - 1].best && ann[ply - 1].cls !== 'mejor';
  const bpos = CH.replay(g.moves.slice(0, showBest ? ply - 1 : ply), g.startFen).pos;
  const uci = showBest ? null : g.moves[ply - 1];
  const last = uci ? [CH.sqParse(uci.slice(0, 2)), CH.sqParse(uci.slice(2, 4))] : [];
  let best = [];
  if (showBest) { const m = bpos.fromUci(ann[ply - 1].best); if (m) best = [CH.mFrom(m), CH.mTo(m)]; }
  const st = CH.status(bpos);
  const orient = RV.orient != null ? RV.orient : (g.mode === 'ai' ? g.human : 0);
  const E = g.analysis && g.analysis.evals;
  let evalBar = '';
  if (E && E[ply]) {
    const t = (startPos.turn + ply) % 2, sc = MO.capScore(E[ply][1]), w = t === 0 ? sc : -sc;
    const pct = Math.max(3, Math.min(97, 50 + 50 * Math.tanh(w / 500)));
    evalBar = `<div class="evbar ${orient ? 'flip' : ''}"><i style="height:${pct}%"></i><span>${evalText(E[ply][1], t)}</span></div>`;
  }
  // comentario de la jugada vista
  let note = '';
  if (ply === 0) note = 'Posición inicial.';
  else {
    const san = CH.sanEs(all.san[ply - 1]);
    const mvNo = Math.floor((startPos.turn + ply - 1) / 2) + startPos.full;
    note = `<b>${mvNo}${(startPos.turn + ply - 1) % 2 ? '…' : '.'} ${esc(san)}</b>`;
    if (ann && ann[ply - 1]) {
      const a = ann[ply - 1], c = CLS[a.cls];
      const prev = CH.replay(g.moves.slice(0, ply - 1), g.startFen).pos;
      const bm = a.best && prev.fromUci(a.best) ? CH.sanEs(prev.san(prev.fromUci(a.best))) : '';
      note += ` <span class="${c[2]}">${c[0] ? c[0] + ' ' : ''}${c[1]}</span>`;
      const why = a.before >= 2000 && a.after < 2000 ? ' (había mate)' : a.after <= -2000 && a.before > -2000 ? ' (permite un mate)' : a.loss >= 900 ? ' (pierdes mucho material)' : a.loss >= 30 ? ' (pierdes ' + fmtPawns(a.loss) + ')' : '';
      if (a.cls !== 'mejor' && bm) note += `<br><span class="mut">Mejor era ${esc(bm)}${why}.</span> <button class="linkb" id="rvBest">${showBest ? 'Ocultar' : 'Ver en el tablero'}</button>`;
    }
  }
  const sum = ann ? summary(g, ann, startPos.turn) : null;
  // lista de jugadas con anotaciones
  let list = '', n = startPos.full, w = startPos.turn === 0;
  all.san.forEach((s, i) => {
    if (w || i === 0) list += `<span class="mn">${n}${w ? '.' : '…'}</span>`;
    const a = ann && ann[i], c = a ? CLS[a.cls] : null;
    list += `<button class="mv ${ply === i + 1 ? 'on' : ''} ${c ? c[2] : ''}" data-rp="${i + 1}">${esc(CH.sanEs(s))}${c && c[0] && a.cls !== 'mejor' ? '<sup>' + c[0] + '</sup>' : ''}</button>`;
    if (!w) n++; w = !w;
  });
  const isCurrent = S.game && S.game.id === g.id;
  $('#subtitle').textContent = g.analysis ? 'Análisis de la partida' : 'Revisar partida';
  $('#app').innerHTML = `<div class="gm rv">
    <div class="gb">
      <div class="rvhead"><b>${esc(g.white)}</b> – <b>${esc(g.black)}</b> <span class="mut">${esc(g.result || '*')}${g.reason && CH.REASONS[g.reason] ? ' · ' + esc(CH.REASONS[g.reason]) : ''}</span></div>
      <div class="bwrap">${evalBar}<div class="board" id="board" style="${boardColors()}">${boardHtml({ pos: bpos, orient, last, best, check: st.check ? bpos.kings[bpos.turn] : -1 })}</div></div>
      <div class="nav"><button data-nav="first" aria-label="Inicio">⏮</button><button data-nav="prev" aria-label="Anterior">◀</button><button data-nav="next" aria-label="Siguiente">▶</button><button data-nav="last" aria-label="Final">⏭</button><button data-nav="flip" aria-label="Girar">⇅</button></div>
    </div>
    <div class="gs">
      ${openingLine(g, ply)}
      <div class="note">${note}</div>
      ${RV.analysing ? `<div class="anprog"><i style="width:${Math.round((RV.progress || 0) * 100)}%"></i><span>Analizando… ${Math.round((RV.progress || 0) * 100)}%</span></div>` : ''}
      ${sum ? `<div class="sum">${[0, 1].map(c => `<div><b>${esc(sideName(g, c))}</b><span>Precisión ${sum[c].acc}%</span><small><i class="c-blun">${sum[c].grave} ??</i> <i class="c-err">${sum[c].error} ?</i> <i class="c-inac">${sum[c].imprecision} ?!</i></small></div>`).join('')}</div>` : ''}
      <div class="mlist">${list || '<span class="mut">Sin jugadas.</span>'}</div>
      <div class="gacts">
        ${!g.analysis && !RV.analysing && g.moves.length ? '<button class="btn-gold" id="rvAn">🔍 Analizar con el motor</button>' : ''}
        ${!st.over ? '<button id="rvPlay">▶ Jugar desde aquí</button>' : ''}
        <button id="rvPgn">📤 PGN</button>
        ${!isCurrent ? '<button id="rvDel" class="btn-ghost">🗑 Borrar</button>' : ''}
        <button id="rvBack">‹ Volver</button>
      </div>
      ${g.analysis ? '<div class="mut" style="margin-top:6px">★ mejor jugada · ?! imprecisión · ? error · ?? error grave. Análisis rápido del motor de la app: orientativo.</div>' : ''}
    </div></div>`;
  const bd = $('#board'); animate(bd, orient);
  const go = p => { const np = Math.max(0, Math.min(all.moves.length, p)); if (np === RV.ply + 1 && !RV.showBest) { const bp = CH.replay(g.moves.slice(0, RV.ply), g.startFen).pos; ANIM = animFor(bp, g.moves[RV.ply]); Sound.play(Sound.forMove(bp, g.moves[RV.ply])); } RV.ply = np; RV.showBest = false; renderReview(); };
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const k = b.dataset.nav;
    if (k === 'first') go(0); else if (k === 'prev') go(RV.ply - 1); else if (k === 'next') go(RV.ply + 1); else if (k === 'last') go(all.moves.length);
    else { RV.orient = 1 - orient; renderReview(); }
  });
  document.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => go(+b.dataset.rp));
  const ml = document.querySelector('.mlist .mv.on'); if (ml) { const box = document.querySelector('.mlist'); box.scrollTop = ml.offsetTop - box.clientHeight / 2; }
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('rvAn', runAnalysis);
  on('rvBest', () => { RV.showBest = !RV.showBest; renderReview(); });
  on('rvPgn', () => sharePgn(g));
  on('rvPlay', () => openContinue(bpos.fen(), bpos.turn));
  on('rvBack', closeReview);
  on('rvDel', () => confirmBox('Borrar partida', 'Se quitará del historial y de la clasificación.', 'Borrar', () => { S.archive = S.archive.filter(a => a.id !== g.id); save(); REVIEW = null; render(); openArchive('partidas'); }, true));
  // deslizar con el dedo sobre el tablero también avanza/retrocede
  let sx = null;
  bd.onpointerdown = e => { sx = e.clientX; };
  bd.onpointerup = e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) go(RV.ply + (dx < 0 ? 1 : -1)); };
}
function closeReview() {
  const RV = REVIEW; REVIEW = null;
  render();
  if (RV && RV.back === 'archive') openArchive('partidas');
}
document.addEventListener('keydown', e => {
  if (!REVIEW || !$('#modal').classList.contains('hidden')) return;
  const n = REVIEW.g.moves.length;
  if (e.key === 'ArrowLeft') { REVIEW.ply = Math.max(0, REVIEW.ply - 1); REVIEW.showBest = false; renderReview(); }
  if (e.key === 'ArrowRight') { REVIEW.ply = Math.min(n, REVIEW.ply + 1); REVIEW.showBest = false; renderReview(); }
});

/* ================= Problemas ================= */
const PZ = window.PROBLEMAS || [];
const pzById = id => PZ.find(p => p.id === id);
function puzzlesHtml() {
  const solved = S.solved || {};
  const tot = PZ.filter(p => solved[p.id]).length;
  const next = PZ.find(p => !solved[p.id]);
  return drillSectionHtml() + `<div class="sec"><h2>Problemas de mate</h2>
      <div class="mut" style="margin-bottom:10px">Encuentra el jaque mate. Juega el bando que tiene el turno y la máquina defiende lo mejor posible. Resueltos: <b>${tot} de ${PZ.length}</b>.</div>
      <div class="pzbar"><i style="width:${PZ.length ? Math.round(tot / PZ.length * 100) : 0}%"></i></div>
      ${next ? `<button class="btn-gold" data-pz="${next.id}" style="width:100%;margin-top:12px">▶ Siguiente sin resolver</button>` : '<div class="empty">🏆 ¡Los has resuelto todos!</div>'}
    </div>
    ${[1, 2, 3].map(n => { const list = PZ.filter(p => p.n === n); const done = list.filter(p => solved[p.id]).length; return list.length ? `<div class="sec"><h2>Mate en ${n} <small class="mut" style="text-transform:none;letter-spacing:0">· ${done}/${list.length}</small></h2>
      <div class="pzgrid">${list.map((p, i) => `<button data-pz="${p.id}" class="${solved[p.id] === 2 ? 'ok1' : solved[p.id] ? 'ok' : ''}">${i + 1}</button>`).join('')}</div></div>` : ''; }).join('')}
    <div class="mut" style="padding:0 4px 10px">Dorado = resuelto a la primera · borde = resuelto con algún fallo o viendo la solución.</div>`;
}
function bindPuzzles() {
  document.querySelectorAll('[data-pz]').forEach(b => b.onclick = () => openPuzzle(b.dataset.pz));
  const ds = $('#drStart'); if (ds) ds.onclick = () => { const l = mistakeList(); if (l.length) openDrill(l[0].key); };
  const da = $('#drAnalyse'); if (da) da.onclick = analysePending;
}
function openPuzzle(id) {
  if (!pzById(id)) return;
  S.pz = { id, moves: [], fails: 0, seen: false, done: false };
  BS.sel = null; HINT = null; render(); window.scrollTo(0, 0);
}
let PZ_BUSY = false, PZ_MSG = '';
function renderPuzzle() {
  const P = pzById(S.pz.id); if (!P) { S.pz = null; return render(); }
  const z = S.pz;
  const start = new CH.Position(P.fen), attacker = start.turn;
  const R = CH.replay(z.moves, P.fen), pos = R.pos, st = CH.status(pos);
  const last = z.moves.length ? [CH.sqParse(z.moves[z.moves.length - 1].slice(0, 2)), CH.sqParse(z.moves[z.moves.length - 1].slice(2, 4))] : [];
  const myTurn = !z.done && !PZ_BUSY && pos.turn === attacker;
  const targets = BS.sel != null && myTurn ? pos.legal().filter(m => CH.mFrom(m) === BS.sel).map(m => CH.mTo(m)) : [];
  const list = PZ.filter(p => p.n === P.n), idx = list.indexOf(P) + 1;
  const left = P.n - Math.floor(z.moves.length / 2);
  $('#subtitle').textContent = 'Mate en ' + P.n + ' · problema ' + idx + ' de ' + list.length;
  const msg = z.done ? (z.seen ? '👀 Esta era la solución.' : z.fails ? '✅ ¡Mate! Resuelto.' : '🏆 ¡Mate a la primera!') : PZ_MSG || (myTurn ? `Juegan las ${COLOR_TXT[attacker]}: mate en ${left}` : 'Responde la defensa…');
  const nextP = PZ.find(p => !(S.solved || {})[p.id] && p.id !== P.id) || PZ[(PZ.indexOf(P) + 1) % PZ.length];
  $('#app').innerHTML = `<div class="gm">
    <div class="gb">
      <div class="pzhead"><span class="pk">${Piezas.piece(6, attacker)}</span><div><b>Juegan las ${COLOR_TXT[attacker]}</b><span class="mut">Da mate en ${P.n} jugada${P.n === 1 ? '' : 's'}</span></div></div>
      <div class="board" id="board" style="${boardColors()}">${boardHtml({ pos, orient: attacker, last, sel: myTurn ? BS.sel : null, targets, hint: HINT || [], check: st.check ? pos.kings[pos.turn] : -1 })}</div>
    </div>
    <div class="gs">
      <div class="gstatus ${z.done ? 'end' : ''} ${PZ_MSG && !z.done ? 'bad' : ''}">${esc(msg)}</div>
      <div class="gacts">
        ${z.done ? `<button class="btn-gold" id="pzNext">Siguiente ›</button><button id="pzRetry">↻ Repetir</button><button id="pzPlay">▶ Jugar desde el inicio</button>` : `<button id="pzHint">💡 Pista</button><button id="pzRetry" ${z.moves.length ? '' : 'disabled'}>↻ Empezar de nuevo</button><button id="pzSol">👀 Solución</button>`}
        <button id="pzBack">‹ Problemas</button>
      </div>
      ${z.done ? `<div class="mut" style="margin-top:8px">Solución: ${esc(solutionText(P))}</div>` : ''}
    </div></div>`;
  const bd = $('#board'); animate(bd, attacker);
  bindBoard(bd, { pos, orient: attacker, canPick: sq => myTurn && pos.b[sq] && (pos.b[sq] >> 3) === pos.turn, onMove: puzzleMove, redraw: renderPuzzle });
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('pzBack', () => { S.pz = null; PZ_MSG = ''; S.draft.mode = 'puzzles'; render(); });
  on('pzRetry', () => { if (PZ_BUSY) return; z.moves = []; z.done = false; PZ_MSG = ''; HINT = null; BS.sel = null; save(); render(); });
  on('pzNext', () => { PZ_MSG = ''; openPuzzle(nextP.id); });
  on('pzHint', () => puzzleHint(P));
  on('pzSol', () => showSolution(P));
  on('pzPlay', () => openContinue(P.fen, start.turn));
}
function solutionText(P) {
  const p = new CH.Position(P.fen); const out = []; let n = p.full, w = p.turn === 0;
  P.sol.forEach((u, i) => { const m = p.fromUci(u); if (!m) return; out.push((w ? n + '. ' : (i === 0 ? n + '… ' : '')) + CH.sanEs(p.san(m))); p.make(m); if (!w) n++; w = !w; });
  return out.join(' ');
}
async function puzzleMove(uci) {
  const z = S.pz, P = pzById(z.id); if (!z || !P || z.done || PZ_BUSY) return;
  const before = CH.replay(z.moves, P.fen).pos;
  const k = z.moves.length, onLine = z.moves.every((m, i) => m === P.sol[i]);
  const left = P.n - Math.floor(k / 2);      // jugadas del atacante que quedan, incluida esta
  ANIM = animFor(before, uci); HINT = null; PZ_MSG = '';
  Sound.play(Sound.forMove(before, uci));
  z.moves.push(uci); save(); render();
  const after = CH.replay(z.moves, P.fen).pos, st = CH.status(after);
  let ok = st.over && st.reason === 'mate';
  if (!ok && left > 1) {
    if (onLine && uci === P.sol[k]) ok = true;
    else { PZ_BUSY = true; try { ok = await Engine.call({ op: 'forced', moves: z.moves, startFen: P.fen, n: left - 1 }); } catch (e) { ok = false; } PZ_BUSY = false; }
  }
  if (S.pz !== z) return;
  if (!ok) {
    z.fails++; PZ_MSG = '❌ Así no hay mate. Prueba otra vez.'; vibrate(60); Sound.play('bad'); save(); render();
    setTimeout(() => { if (S.pz === z && z.moves.length === k + 1) { z.moves.pop(); save(); render(); } }, 900);
    return;
  }
  if (st.over) { z.done = true; if (!z.seen) { S.solved = S.solved || {}; S.solved[z.id] = Math.max(S.solved[z.id] || 0, z.fails ? 1 : 2); } vibrate([20, 40, 20]); setTimeout(() => Sound.play('ok'), 200); save(); render(); return; }
  // respuesta de la defensa
  PZ_BUSY = true; render();
  let reply = null;
  const stillOnLine = z.moves.every((m, i) => m === P.sol[i]);
  if (stillOnLine && P.sol[k + 1]) reply = P.sol[k + 1];
  else { try { const d = await Engine.call({ op: 'defense', moves: z.moves, startFen: P.fen, n: left - 1 }); reply = d && d.move; } catch (e) { reply = null; } }
  await new Promise(r => setTimeout(r, 450));
  PZ_BUSY = false;
  if (S.pz !== z) return;
  if (!reply) { render(); return; }
  const bp = CH.replay(z.moves, P.fen).pos; ANIM = animFor(bp, reply);
  Sound.play(Sound.forMove(bp, reply));
  z.moves.push(reply); save(); render();
}
async function puzzleHint(P) {
  const z = S.pz; if (PZ_BUSY || z.done) return;
  const onLine = z.moves.every((m, i) => m === P.sol[i]);
  let u = onLine ? P.sol[z.moves.length] : null;
  if (!u) { const left = P.n - Math.floor(z.moves.length / 2); try { u = await Engine.call({ op: 'mate', moves: z.moves, startFen: P.fen, n: left }); } catch (e) { u = null; } }
  if (!u || S.pz !== z) return;
  z.fails = Math.max(z.fails, 1);
  HINT = [CH.sqParse(u.slice(0, 2))]; PZ_MSG = '💡 Mueve la pieza marcada.'; save(); render();
}
function showSolution(P) {
  const z = S.pz; if (PZ_BUSY) return;
  z.moves = []; z.seen = true; HINT = null; PZ_MSG = ''; PZ_BUSY = true; render();
  let i = 0;
  const step = () => {
    if (S.pz !== z) { PZ_BUSY = false; return; }
    if (i >= P.sol.length) { PZ_BUSY = false; z.done = true; save(); render(); return; }
    const bp = CH.replay(z.moves, P.fen).pos; ANIM = animFor(bp, P.sol[i]); Sound.play(Sound.forMove(bp, P.sol[i])); z.moves.push(P.sol[i++]); render();
    setTimeout(step, 750);
  };
  setTimeout(step, 400);
}


/* ================= Jugar desde una posición ================= */
// Abre la elección de modo para seguir jugando desde la posición `fen` (turn = bando que juega)
function openContinue(fen, turn) {
  const st = { mode: 'ai', color: turn, level: S.draft.ai.level || 3 };
  const draw = () => {
    openModal(`<h3>▶ Jugar desde aquí</h3><div class="sub">Empieza una partida nueva desde esta posición. No cuenta para el Elo.</div>
      <div class="kinds" style="margin:0 0 12px">${[['ai', '🤖 Contra la máquina'], ['local', '👥 Dos jugadores']].map(([k, l]) => `<button data-cm="${k}" class="${st.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${st.mode === 'ai' ? `<div class="pf-t">Juegas con</div><div class="kinds" style="margin:0 0 12px">${[0, 1].map(c => `<button class="colbtn ${st.color === c ? 'on' : ''}" data-cc="${c}">${Piezas.piece(6, c)}${c ? 'Negras' : 'Blancas'}${c === turn ? ' <small>(mueven)</small>' : ''}</button>`).join('')}</div>
        <div class="pf-t">Nivel</div><div class="chips">${LEVELS.slice(1).map((L, i) => `<button class="chipb ${st.level === i + 1 ? 'on' : ''}" data-cl="${i + 1}">${i + 1} · ${esc(L.name)}</button>`).join('')}</div>` : '<div class="mut" style="margin-bottom:8px">Se usan los nombres de «Dos jugadores» de la pantalla de inicio.</div>'}
      <div class="acts"><button class="btn-ghost" id="ctNo">Cancelar</button><button class="btn-gold" id="ctGo">Empezar</button></div>`);
    document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { st.mode = b.dataset.cm; draw(); });
    document.querySelectorAll('[data-cc]').forEach(b => b.onclick = () => { st.color = +b.dataset.cc; draw(); });
    document.querySelectorAll('[data-cl]').forEach(b => b.onclick = () => { st.level = +b.dataset.cl; draw(); });
    $('#ctNo').onclick = closeModal;
    $('#ctGo').onclick = () => {
      closeModal();
      if (S.game && !S.game.result && S.game.moves.length) { pauseClock(); archiveUpsert(S.game); toast('La partida anterior se ha guardado sin terminar'); }
      THINK = null; Engine.reset(); REVIEW = null; S.pz = null; S.drill = null; PZ_MSG = '';
      if (st.mode === 'ai') startGame({ mode: 'ai', human: st.color, level: st.level, name: canonName(S.draft.ai.name, 'Tú'), clock: null, learn: !!S.draft.ai.learn, startFen: fen });
      else { const L = S.draft.local; startGame({ mode: 'local', white: canonName(L.white, 'Blancas'), black: canonName(L.black, 'Negras'), clock: null, flip: !!L.flip, startFen: fen }); }
      window.scrollTo(0, 0);
    };
  };
  draw();
}

/* ================= Repasa tus errores ================= */
// Errores y errores graves de las partidas analizadas (los tuyos contra la máquina; los de los dos en partidas de dos jugadores)
function mistakeList() {
  const out = [], done = S.mist || {};
  for (const a of S.archive) {
    if (!a.analysis || a.mode === 'pgn') continue;
    const ann = annotate(a); if (!ann) continue;
    let t0; try { t0 = new CH.Position(a.startFen || CH.START_FEN).turn; } catch (e) { continue; }
    ann.forEach((x, i) => {
      if ((x.cls !== 'grave' && x.cls !== 'error') || !x.best) return;
      const c = (t0 + i) % 2;
      if (a.mode === 'ai' && c !== a.human) return;
      out.push({ key: a.id + ':' + i, g: a, ply: i, best: x.best, played: a.moves[i], loss: x.loss, before: x.before, color: c, who: c ? a.black : a.white, ts: a.finished || a.created, state: done[a.id + ':' + i] });
    });
  }
  // primero los pendientes y, dentro, los más recientes
  return out.sort((x, y) => ((x.state === 2) - (y.state === 2)) || (y.ts - x.ts) || (x.ply - y.ply));
}
function drillSectionHtml() {
  const list = mistakeList(), pend = list.filter(x => x.state !== 2).length;
  const noAn = S.archive.filter(a => !a.analysis && a.result && a.mode !== 'pgn' && a.moves.length >= 6).length;
  return `<div class="sec"><h2>🔁 Repasa tus errores</h2>
    <div class="mut" style="margin-bottom:10px;line-height:1.45">Vuelve a las posiciones donde se cometió un error en vuestras partidas analizadas y busca una jugada mejor.${list.length ? ` Hay <b>${list.length}</b>; pendientes <b>${pend}</b>.` : ''}</div>
    ${list.length ? `<button class="btn-gold" id="drStart" style="width:100%">▶ ${pend ? 'Repasar (' + pend + (pend === 1 ? ' pendiente)' : ' pendientes)') : 'Repasar otra vez'}</button>` : `<div class="mut" style="margin-bottom:6px">${S.archive.some(a => a.analysis) ? 'Las partidas analizadas no tienen errores. ¡Bien jugado!' : 'Aún no hay partidas analizadas.'}</div>`}
    ${noAn ? `<button id="drAnalyse" style="width:100%;margin-top:8px">🔍 Analizar ${Math.min(noAn, 5)} partida${Math.min(noAn, 5) === 1 ? '' : 's'} sin analizar${noAn > 5 ? ' (de ' + noAn + ')' : ''}</button>` : ''}
  </div>`;
}
// Analiza hasta 5 partidas terminadas que aún no tienen análisis
async function analysePending() {
  const list = S.archive.filter(a => !a.analysis && a.result && a.mode !== 'pgn' && a.moves.length >= 6).slice(0, 5);
  if (!list.length) return;
  let stop = false, i = 0;
  const draw = p => {
    const box = document.querySelector('#apProg');
    if (box) { box.querySelector('i').style.width = Math.round(p * 100) + '%'; box.querySelector('span').textContent = `Partida ${Math.min(i + 1, list.length)} de ${list.length} · ${Math.round(p * 100)}%`; }
  };
  openModal(`<h3>🔍 Analizando partidas</h3><div class="sub">El motor revisa cada jugada. Tarda unos segundos por partida.</div>
    <div class="anprog" id="apProg"><i style="width:0%"></i><span>Partida 1 de ${list.length}</span></div>
    <div class="acts"><button class="btn-ghost" id="apStop">Parar</button></div>`);
  modalOnClose = () => { stop = true; Engine.reset(); };
  $('#apStop').onclick = closeModal;
  for (i = 0; i < list.length && !stop; i++) {
    const a = list[i];
    let ev = null;
    try { ev = await Engine.call({ op: 'analyse', moves: a.moves, startFen: a.startFen, timeMs: analysisMs(a.moves.length) }, p => draw((i + p) / list.length)); } catch (e) { ev = null; }
    if (stop) break;
    if (ev) { a.analysis = { evals: ev.map(e => [e.best || '', e.score]), at: Date.now() }; save(); }
  }
  if (!stop) { modalOnClose = null; closeModal(); toast('Análisis terminado'); }
  render();
}
function openDrill(key) {
  S.drill = { key, done: false, fails: 0, seen: false, move: null };
  PZ_MSG = ''; HINT = null; BS.sel = null; render(); window.scrollTo(0, 0);
}
let DR_BUSY = false;
function renderDrill() {
  const list = mistakeList(), it = list.find(x => x.key === S.drill.key);
  if (!it) { S.drill = null; return render(); }
  const z = S.drill, g = it.g;
  const base = CH.replay(g.moves.slice(0, it.ply), g.startFen).pos;
  const pos = z.move ? CH.replay(g.moves.slice(0, it.ply).concat([z.move]), g.startFen).pos : base;
  const lastU = z.move || g.moves[it.ply - 1];
  const last = lastU ? [CH.sqParse(lastU.slice(0, 2)), CH.sqParse(lastU.slice(2, 4))] : [];
  const myTurn = !z.done && !DR_BUSY && !z.move;
  const targets = BS.sel != null && myTurn ? pos.legal().filter(m => CH.mFrom(m) === BS.sel).map(m => CH.mTo(m)) : [];
  const playedSan = CH.sanEs(base.san(base.fromUci(it.played)));
  const bestM = base.fromUci(it.best), bestSan = bestM ? CH.sanEs(base.san(bestM)) : it.best;
  const idx = list.indexOf(it) + 1;
  const d = new Date(it.ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  const rival = it.color === 0 ? g.black : g.white;
  let best = [];
  if (z.done && bestM) best = [CH.mFrom(bestM), CH.mTo(bestM)];
  const st = CH.status(pos);
  $('#subtitle').textContent = 'Repasa tus errores · ' + idx + ' de ' + list.length;
  const msg = z.done ? (z.seen ? `👀 La mejor era ${bestSan}.` : z.fails ? `✅ ¡Bien! (la del motor era ${bestSan})` : `🏆 ¡A la primera! (la del motor era ${bestSan})`) : PZ_MSG || (DR_BUSY ? '🔎 Comprobando tu jugada…' : `Juegan las ${COLOR_TXT[it.color]}: busca algo mejor`);
  $('#app').innerHTML = `<div class="gm">
    <div class="gb">
      <div class="pzhead"><span class="pk">${Piezas.piece(6, it.color)}</span><div><b>${esc(it.who)} contra ${esc(rival)}</b><span class="mut">${esc(d)} · jugada ${Math.floor(it.ply / 2) + 1}</span></div></div>
      <div class="board" id="board" style="${boardColors()}">${boardHtml({ pos, orient: it.color, last, sel: myTurn ? BS.sel : null, targets, hint: HINT || [], best, check: st.check ? pos.kings[pos.turn] : -1 })}</div>
    </div>
    <div class="gs">
      <div class="gstatus ${z.done ? 'end' : ''} ${PZ_MSG && !z.done ? 'bad' : ''}">${esc(msg)}</div>
      <div class="note" style="margin-top:8px">En la partida se jugó <b class="c-blun">${esc(playedSan)}${it.loss >= 300 ? '??' : '?'}</b> y se perdió ${it.loss >= 900 ? 'mucho' : 'unos ' + fmtPawns(it.loss) + ' peones'}.</div>
      <div class="gacts" style="margin-top:8px">
        ${z.done ? `<button class="btn-gold" id="drNext">Siguiente ›</button><button id="drRetry">↻ Repetir</button><button id="drPlay">▶ Jugar desde aquí</button>` : `<button id="drHint" ${DR_BUSY ? 'disabled' : ''}>💡 Pista</button><button id="drSol" ${DR_BUSY ? 'disabled' : ''}>👀 Solución</button>`}
        <button id="drGame">📜 Ver la partida</button><button id="drBack">‹ Volver</button>
      </div>
    </div></div>`;
  const bd = $('#board'); animate(bd, it.color);
  bindBoard(bd, { pos, orient: it.color, canPick: sq => myTurn && pos.b[sq] && (pos.b[sq] >> 3) === pos.turn, onMove: u => drillMove(it, u), redraw: renderDrill });
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('drBack', () => { S.drill = null; PZ_MSG = ''; HINT = null; S.draft.mode = 'puzzles'; render(); });
  on('drRetry', () => { z.done = false; z.move = null; z.seen = false; PZ_MSG = ''; HINT = null; render(); });
  on('drNext', () => { const nl = mistakeList(), nx = nl.find(x => x.key !== it.key && x.state !== 2) || nl[(nl.findIndex(x => x.key === it.key) + 1) % nl.length]; PZ_MSG = ''; openDrill(nx.key); });
  on('drHint', () => { HINT = bestM ? [CH.mFrom(bestM)] : []; z.fails = Math.max(1, z.fails); PZ_MSG = '💡 Mueve la pieza marcada.'; render(); });
  on('drSol', () => { z.seen = true; z.done = true; z.move = null; PZ_MSG = ''; HINT = null; S.mist = S.mist || {}; if (!S.mist[it.key]) S.mist[it.key] = 0; save(); render(); });
  on('drPlay', () => openContinue(base.fen(), base.turn));
  on('drGame', () => { openGameReview(g, 'drill'); REVIEW.ply = it.ply + 1; render(); });
}
async function drillMove(it, uci) {
  const z = S.drill; if (!z || z.done || DR_BUSY) return;
  const g = it.g, before = CH.replay(g.moves.slice(0, it.ply), g.startFen).pos;
  ANIM = animFor(before, uci); Sound.play(Sound.forMove(before, uci));
  z.move = uci; HINT = null; PZ_MSG = '';
  let ok = uci === it.best;
  if (!ok && uci !== it.played) {
    const after = CH.replay(g.moves.slice(0, it.ply).concat([uci]), g.startFen).pos, st = CH.status(after);
    if (st.over && st.reason === 'mate') ok = true;
    else {
      DR_BUSY = true; render();
      let r1 = null, r0 = null;
      try { [r0, r1] = await Promise.all([Engine.call({ op: 'best', moves: g.moves.slice(0, it.ply), startFen: g.startFen, timeMs: 500 }), Engine.call({ op: 'best', moves: g.moves.slice(0, it.ply).concat([uci]), startFen: g.startFen, timeMs: 500 })]); } catch (e) {}
      DR_BUSY = false;
      if (S.drill !== z) return;
      if (r0 && r1) {
        const bs = Math.max(MO.capScore(r0.score), it.before), as = -MO.capScore(r1.score);
        ok = r0.move === uci || bs - as < 70 || (bs >= 2000 && as >= 2000);
      } else if (st.over) ok = st.result !== '1/2-1/2';
    }
  } else render();
  if (S.drill !== z) return;
  if (!ok) {
    z.fails++; PZ_MSG = uci === it.played ? '❌ Esa es la jugada de la partida. Busca otra.' : '❌ Esa tampoco es buena. Prueba otra vez.';
    Sound.play('bad'); vibrate(60); render();
    setTimeout(() => { if (S.drill === z && z.move === uci && !z.done) { z.move = null; render(); } }, 900);
    return;
  }
  z.done = true; S.mist = S.mist || {};
  if (!z.seen) S.mist[it.key] = Math.max(S.mist[it.key] || 0, z.fails ? 1 : 2);
  Sound.play('ok'); vibrate([20, 40, 20]); save(); render();
}
