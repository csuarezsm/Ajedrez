/* Ajedrez — motor de juego propio (IT Canarias)
   © 2026 IT Canarias. Todos los derechos reservados.
   Búsqueda alfa-beta (PVS) con profundización iterativa, quiescencia, tabla de transposición,
   jugada nula, reducciones tardías, jugadas asesinas e historia. Evaluación con tablas de
   posición propias (calculadas aquí con fórmulas sencillas) y un pequeño libro de aperturas.
   No usa código de ningún otro motor. */
(function (root) {
'use strict';
const A = root.Ajedrez || (typeof require !== 'undefined' ? require('./ajedrez.js') : null);
const { Position, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, F_CAP, F_PROMO, F_CASTLE } = A;

const INF = 32000, MATE = 30000, MATE_BOUND = 29000;
const VAL_MG = [0, 100, 320, 330, 500, 950, 0];
const VAL_EG = [0, 120, 300, 320, 540, 960, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

/* ---------- Tablas de posición (desde el punto de vista de las blancas; índice = fila*8 + columna) ---------- */
const PST_MG = [], PST_EG = [];
(function buildTables() {
  const cdist = (r, f) => Math.max(Math.abs(3.5 - r), Math.abs(3.5 - f));      // 0.5 (centro) … 3.5 (borde)
  const manh = (r, f) => Math.abs(3.5 - r) + Math.abs(3.5 - f);                 // 1 … 7
  for (let t = 0; t <= 6; t++) { PST_MG[t] = new Int16Array(64); PST_EG[t] = new Int16Array(64); }
  const PAWN_ADV_MG = [0, 0, 4, 10, 22, 38, 70, 0], PAWN_ADV_EG = [0, 0, 8, 18, 34, 58, 95, 0];
  const KING_MG = [[18, 28, 8, -6, -2, 8, 30, 20], [8, 6, -8, -18, -18, -10, 6, 8]];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const i = r * 8 + f, cd = cdist(r, f), md = manh(r, f);
    const center = (f === 3 || f === 4) ? 1 : (f === 2 || f === 5) ? 0.5 : 0;
    // peón: avanzar y ocupar el centro
    PST_MG[PAWN][i] = r === 0 || r === 7 ? 0 : PAWN_ADV_MG[r] + Math.round(center * (r === 3 || r === 4 ? 16 : r === 2 ? 6 : 4)) - (r === 1 && center === 1 ? 4 : 0);
    PST_EG[PAWN][i] = r === 0 || r === 7 ? 0 : PAWN_ADV_EG[r];
    // caballo: muy malo en el borde
    PST_MG[KNIGHT][i] = Math.round(30 - md * 9 - (cd === 3.5 ? 12 : 0)) + (r === 0 ? -8 : 0);
    PST_EG[KNIGHT][i] = Math.round(24 - md * 8);
    // alfil: centro y diagonales largas
    PST_MG[BISHOP][i] = Math.round(12 - cd * 6) + (r === f || r === 7 - f ? 6 : 0) + (r === 0 ? -8 : 0);
    PST_EG[BISHOP][i] = Math.round(10 - cd * 5);
    // torre: séptima fila y columnas centrales
    PST_MG[ROOK][i] = (r === 6 ? 18 : 0) + (f === 3 || f === 4 ? 6 : f === 0 || f === 7 ? -4 : 0);
    PST_EG[ROOK][i] = r === 6 ? 10 : 0;
    // dama: algo de centro, sin salir pronto
    PST_MG[QUEEN][i] = Math.round(6 - cd * 3) + (r === 0 ? 0 : r === 1 ? 2 : 0);
    PST_EG[QUEEN][i] = Math.round(16 - md * 4);
    // rey: resguardado en el medio juego, activo en el final
    PST_MG[KING][i] = r < 2 ? KING_MG[r][f] : -22 - (r - 2) * 10;
    PST_EG[KING][i] = Math.round(34 - md * 9);
  }
})();
const PASSED_MG = [0, 4, 8, 14, 26, 44, 70, 0], PASSED_EG = [0, 10, 16, 28, 48, 80, 125, 0];

function evaluate(pos) {
  const b = pos.b;
  let mg = 0, eg = 0, phase = 0;
  const pawnFiles = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
  const pawnMin = [[8, 8, 8, 8, 8, 8, 8, 8], [8, 8, 8, 8, 8, 8, 8, 8]];   // fila relativa más atrasada
  const pawnMax = [[-1, -1, -1, -1, -1, -1, -1, -1], [-1, -1, -1, -1, -1, -1, -1, -1]];
  const pawns = [[], []], rooks = [[], []];
  let bishops0 = 0, bishops1 = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if (!p) continue;
    const t = p & 7, c = p >> 3, r = s >> 4, f = s & 7;
    const rr = c ? 7 - r : r, i = rr * 8 + f;
    const sign = c ? -1 : 1;
    mg += sign * (VAL_MG[t] + PST_MG[t][i]);
    eg += sign * (VAL_EG[t] + PST_EG[t][i]);
    phase += PHASE[t];
    if (t === PAWN) {
      pawnFiles[c][f]++; pawns[c].push(s);
      if (rr < pawnMin[c][f]) pawnMin[c][f] = rr;
      if (rr > pawnMax[c][f]) pawnMax[c][f] = rr;
    } else if (t === ROOK) rooks[c].push(f);
    else if (t === BISHOP) { if (c) bishops1++; else bishops0++; }
  }
  if (bishops0 >= 2) { mg += 30; eg += 45; }
  if (bishops1 >= 2) { mg -= 30; eg -= 45; }
  // estructura de peones
  for (let c = 0; c < 2; c++) {
    const sign = c ? -1 : 1, them = c ^ 1;
    for (let f = 0; f < 8; f++) {
      const n = pawnFiles[c][f]; if (!n) continue;
      if (n > 1) { mg -= sign * 10 * (n - 1); eg -= sign * 18 * (n - 1); }
      const iso = (f === 0 || !pawnFiles[c][f - 1]) && (f === 7 || !pawnFiles[c][f + 1]);
      if (iso) { mg -= sign * 10; eg -= sign * 12; }
    }
    for (const s of pawns[c]) {
      const f = s & 7, rr = c ? 7 - (s >> 4) : (s >> 4);
      // pasado: ningún peón rival delante en su columna ni en las vecinas
      let passed = true;
      for (let df = -1; df <= 1 && passed; df++) {
        const ff = f + df; if (ff < 0 || ff > 7 || !pawnFiles[them][ff]) continue;
        // fila relativa del rival vista desde nuestro lado: 7 - su fila relativa
        const theirMostAdvancedTowardUs = 7 - pawnMin[them][ff];
        const theirLeast = 7 - pawnMax[them][ff];
        if (theirMostAdvancedTowardUs > rr || theirLeast > rr) passed = false;
      }
      if (passed) { mg += sign * PASSED_MG[rr]; eg += sign * PASSED_EG[rr]; }
    }
    // torres en columna abierta o semiabierta
    for (const f of rooks[c]) {
      if (!pawnFiles[c][f]) { const open = !pawnFiles[them][f]; mg += sign * (open ? 22 : 10); eg += sign * (open ? 10 : 5); }
    }
    // escudo de peones delante del rey (medio juego)
    const k = pos.kings[c], kf = k & 7, kr = k >> 4, krr = c ? 7 - kr : kr;
    if (krr <= 1) {
      let shield = 0;
      for (let df = -1; df <= 1; df++) {
        const ff = kf + df; if (ff < 0 || ff > 7) continue;
        for (let d = 1; d <= 2; d++) { const sq = k + (c ? -16 : 16) * d + df; if (!(sq & 0x88) && b[sq] === (PAWN | (c << 3))) { shield += d === 1 ? 12 : 6; break; } }
      }
      mg += sign * shield;
    }
  }
  if (phase > 24) phase = 24;
  let score = Math.round((mg * phase + eg * (24 - phase)) / 24);
  // final ganado: llevar al rey contrario al borde y acercar el propio
  if (phase <= 6) {
    const diff = score;
    if (Math.abs(diff) > 250) {
      const strong = diff > 0 ? WHITE : BLACK, weak = strong ^ 1;
      const wk = pos.kings[weak], sk = pos.kings[strong];
      const edge = Math.max(Math.abs(3.5 - (wk >> 4)), Math.abs(3.5 - (wk & 7)));
      const kd = Math.max(Math.abs((wk >> 4) - (sk >> 4)), Math.abs((wk & 7) - (sk & 7)));
      const bonus = Math.round(edge * 14 + (7 - kd) * 6);
      score += strong === WHITE ? bonus : -bonus;
    }
  }
  // tablas evidentes por falta de material
  if (pos.insufficient()) return 0;
  return (pos.turn === WHITE ? score : -score) + 10;   // +10: pequeña ventaja por tener el turno
}

/* ---------- Libro de aperturas (líneas principales, en UCI) ---------- */
const BOOK_LINES = [
  // Abierta: italiana, española, escocesa, dos caballos, petrov
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8',
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3 g8f6 e1g1 d7d6 c2c3 a7a6',
  'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8e7 e1g1 e8g8 f1e1 d7d6',
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8',
  'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6 d4e5 d6f5',
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6 e1g1 f7f6 d2d4 e5d4',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5 d8e7',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 d4b3 c5b6 b1c3 g8f6',
  'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3 b8c6',
  'e2e4 e7e5 b1c3 g8f6 g1f3 b8c6 f1b5 f8b4 e1g1 e8g8',
  // Siciliana
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1e3 e7e5 d4b3 c8e6',
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6 c1e3 f8g7 f2f3 e8g8',
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5 d4b5 d7d6',
  'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6 b1c3 d8c7 c1e3 a7a6',
  'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6',
  'e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4 g1f3 b8c6',
  // Francesa y Caro-Kann
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7 g5e7 d8e7',
  'e2e4 e7e6 d2d4 d7d5 b1d2 c7c5 g1f3 b8c6 e4d5 e6d5',
  'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6 h2h4 h7h6',
  'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5',
  // Escandinava, Pirc, Alekhine
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5',
  'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8 e1g1',
  'e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 c8g4 f1e2 e7e6',
  // Gambito de dama, eslava, india de rey, nimzoindia, grünfeld
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6',
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5 e2e3 e7e6',
  'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5 e1g1 a7a6',
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5',
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3 c7c5',
  'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7 e1g1 e8g8',
  'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7',
  'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3 b8c6',
  'd2d4 g8f6 g1f3 e7e6 c1g5 c7c5 e2e3 f8e7',
  'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6 g1f3 f8e7 e1g1 e8g8',
  // Inglesa, Reti
  'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5 f1g2',
  'c2c4 g8f6 b1c3 e7e6 g1f3 d7d5 d2d4 f8e7',
  'c2c4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 g1f3',
  'g1f3 d7d5 g2g3 g8f6 f1g2 g7g6 e1g1 f8g7 d2d3 e8g8',
  'g1f3 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7 e1g1 e8g8',
];
const BOOK = (() => {
  const t = new Map();
  for (const line of BOOK_LINES) {
    const mv = line.split(' ');
    for (let i = 0; i < mv.length; i++) {
      const k = mv.slice(0, i).join(' ');
      const o = t.get(k) || {}; o[mv[i]] = (o[mv[i]] || 0) + 1; t.set(k, o);
    }
  }
  return t;
})();
function bookMove(moves, rnd) {
  const o = BOOK.get((moves || []).join(' '));
  if (!o) return null;
  const list = Object.entries(o), tot = list.reduce((a, x) => a + x[1], 0);
  let r = (rnd || Math.random)() * tot;
  for (const [m, w] of list) { r -= w; if (r < 0) return m; }
  return list[0][0];
}

/* ---------- Búsqueda ---------- */
const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
let ttKey = null, ttMove, ttScore, ttDepth, ttFlag;
function ttInit() {
  if (ttKey) return;
  ttKey = new Int32Array(TT_SIZE); ttMove = new Int32Array(TT_SIZE); ttScore = new Int16Array(TT_SIZE); ttDepth = new Int8Array(TT_SIZE); ttFlag = new Int8Array(TT_SIZE);
}
function ttClear() { if (ttKey) { ttKey.fill(0); ttMove.fill(0); ttDepth.fill(0); ttFlag.fill(0); } }
const EXACT = 1, LOWER = 2, UPPER = 3;

class Search {
  constructor(pos, opts) {
    this.pos = pos; this.nodes = 0; this.stop = false;
    this.deadline = opts.timeMs ? Date.now() + opts.timeMs : Infinity;
    this.maxNodes = opts.nodes || Infinity;
    this.killers = []; for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
    this.history = new Int32Array(16 * 128);
    ttInit();
  }
  timeUp() {
    if (this.stop) return true;
    if ((this.nodes & 1023) === 0 && (Date.now() > this.deadline || this.nodes > this.maxNodes)) this.stop = true;
    if (this.nodes > this.maxNodes) this.stop = true;
    return this.stop;
  }
  score(m, ttm, ply) {
    if (m === ttm) return 1e7;
    const b = this.pos.b, fl = m >> 17;
    if (fl & F_PROMO) return 9e6 + ((m >> 14) & 7);
    if (fl & F_CAP) { const victim = (fl & 2) ? PAWN : b[(m >> 7) & 127] & 7, att = b[m & 127] & 7; return 8e6 + VAL_MG[victim] * 10 - VAL_MG[att] / 10; }
    const k = this.killers[ply]; if (m === k[0]) return 7e6; if (m === k[1]) return 6.9e6;
    return this.history[b[m & 127] * 128 + ((m >> 7) & 127)];
  }
  order(moves, ttm, ply) {
    const sc = moves.map(m => this.score(m, ttm, ply));
    const idx = moves.map((_, i) => i).sort((a, b) => sc[b] - sc[a]);
    return idx.map(i => moves[i]);
  }
  nonPawn(c) { const b = this.pos.b; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const p = b[s]; if (p && (p >> 3) === c) { const t = p & 7; if (t !== PAWN && t !== KING) return true; } } return false; }
  quiesce(alpha, beta, ply) {
    this.nodes++;
    if (this.timeUp()) return 0;
    const pos = this.pos, inCheck = pos.inCheck();
    if (ply > 60) return evaluate(pos);
    let best = -INF;
    if (!inCheck) {
      const stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
    }
    const moves = this.order(pos.pseudo([], !inCheck), 0, Math.min(ply, 127));
    const us = pos.turn; let legal = 0;
    for (const m of moves) {
      pos.make(m);
      if (pos.attacked(pos.kings[us], us ^ 1)) { pos.unmake(m); continue; }
      legal++;
      const sc = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake(m);
      if (this.stop) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) { alpha = sc; if (sc >= beta) return sc; }
    }
    if (inCheck && !legal) return -MATE + ply;
    return best;
  }
  negamax(depth, alpha, beta, ply, allowNull) {
    const pos = this.pos;
    if (ply > 0) {
      if (pos.half >= 100 || pos.repetitions() >= 1 || pos.insufficient()) return 0;
      // poda por distancia al mate
      alpha = Math.max(alpha, -MATE + ply); beta = Math.min(beta, MATE - ply - 1); if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    this.nodes++;
    if (this.timeUp()) return 0;
    const idx = pos.h1 & TT_MASK;
    let ttm = 0;
    if (ttKey[idx] === pos.h2) {
      ttm = ttMove[idx];
      if (ply > 0 && ttDepth[idx] >= depth) {
        let s = ttScore[idx]; if (s > MATE_BOUND) s -= ply; else if (s < -MATE_BOUND) s += ply;
        const f = ttFlag[idx];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }
    const pv = beta - alpha > 1;
    if (!pv && !inCheck && allowNull && depth >= 3 && this.nonPawn(pos.turn) && evaluate(pos) >= beta) {
      pos.makeNull();
      const s = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stop) return 0;
      if (s >= beta && s < MATE_BOUND) return beta;
    }
    const moves = this.order(pos.pseudo([]), ttm, ply);
    const us = pos.turn, a0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (const m of moves) {
      pos.make(m);
      if (pos.attacked(pos.kings[us], us ^ 1)) { pos.unmake(m); continue; }
      legal++;
      const quiet = !((m >> 17) & (F_CAP | F_PROMO));
      let sc;
      if (legal === 1) sc = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let r = 0;
        if (quiet && depth >= 3 && legal > 3 && !inCheck && !pos.inCheck()) r = legal > 8 ? 2 : 1;
        sc = -this.negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (!this.stop && sc > alpha && (r || sc < beta)) sc = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake(m);
      if (this.stop) return 0;
      if (sc > best) { best = sc; bestMove = m; if (ply === 0) this.rootBest = m, this.rootScore = sc; }
      if (sc > alpha) {
        alpha = sc;
        if (sc >= beta) {
          if (quiet) { const k = this.killers[ply]; if (k[0] !== m) { k[1] = k[0]; k[0] = m; } this.history[pos.b[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth; }
          break;
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    let st = best; if (st > MATE_BOUND) st += ply; else if (st < -MATE_BOUND) st -= ply;
    ttKey[idx] = pos.h2; ttMove[idx] = bestMove; ttScore[idx] = st; ttDepth[idx] = depth;
    ttFlag[idx] = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }
  pv(max) {
    const pos = this.pos, line = [], done = [];
    for (let i = 0; i < (max || 8); i++) {
      const idx = pos.h1 & TT_MASK; if (ttKey[idx] !== pos.h2) break;
      const m = ttMove[idx]; if (!m || !pos.legal().includes(m)) break;
      line.push(pos.uci(m)); pos.make(m); done.push(m);
    }
    while (done.length) pos.unmake(done.pop());
    return line;
  }
}

// Mejor jugada: { move (UCI), score (desde el bando que juega), depth, nodes, pv }
function think(pos, opts) {
  opts = opts || {};
  const S = new Search(pos, opts);
  const legal = pos.legal();
  if (!legal.length) return null;
  if (legal.length === 1 && !opts.analyse) return { move: pos.uci(legal[0]), score: 0, depth: 0, nodes: 0, pv: [pos.uci(legal[0])] };
  const maxDepth = opts.depth || 64;
  let best = legal[0], bestScore = 0, depthDone = 0;
  for (let d = 1; d <= maxDepth; d++) {
    S.rootBest = 0;
    const sc = S.negamax(d, -INF, INF, 0, false);
    if (S.stop) { if (S.rootBest && depthDone) best = S.rootBest; break; }
    best = S.rootBest || best; bestScore = sc; depthDone = d;
    if (Math.abs(sc) > MATE_BOUND && d >= 3 && !opts.analyse) break;   // mate encontrado
    if (Date.now() > S.deadline - (opts.timeMs || 0) * 0.45 && opts.timeMs) break;   // no empezar una iteración que no acabará
  }
  if (!depthDone) { best = S.rootBest || best; }
  return { move: pos.uci(best), score: bestScore, depth: depthDone, nodes: S.nodes, pv: S.pv(10) };
}

// Puntuación de cada jugada de la raíz (para los niveles bajos, que eligen con algo de azar)
function rootScores(pos, depth, opts) {
  const S = new Search(pos, Object.assign({}, opts, { timeMs: 0 }));
  const us = pos.turn, out = [];
  for (const m of pos.pseudo([])) {
    pos.make(m);
    if (pos.attacked(pos.kings[us], us ^ 1)) { pos.unmake(m); continue; }
    const sc = depth > 1 ? -S.negamax(depth - 1, -INF, INF, 1, true) : -S.quiesce(-INF, INF, 1);
    pos.unmake(m);
    out.push({ m, sc });
  }
  return out;
}

/* ---------- Niveles ---------- */
const LEVELS = [
  null,
  // Calibrados con partidas entre niveles vecinos (tools/calibrar-niveles.js): cada nivel saca entre
  // un 85 % y un 95 % de los puntos al anterior. El Elo es una estimación para la clasificación.
  { name: 'Principiante', elo: 600,  depth: 1, noise: 150, blunder: 0.07, book: 4 },
  { name: 'Aficionado',   elo: 800,  depth: 2, noise: 170, blunder: 0.06, book: 6 },
  { name: 'Intermedio',   elo: 950,  depth: 2, noise: 95,  blunder: 0.03, book: 8 },
  { name: 'Avanzado',     elo: 1150, depth: 3, noise: 70,  blunder: 0.02, book: 12 },
  { name: 'Experto',      elo: 1450, time: 350, depth: 6, noise: 15, book: 16 },
  { name: 'Club',         elo: 1650, time: 2500, book: 24 },
];

// Jugada de la máquina para un nivel. moves = jugadas desde el inicio (para el libro), rnd opcional (pruebas)
function levelMove(pos, level, moves, opts) {
  opts = opts || {};
  const L = LEVELS[level] || LEVELS[3];
  const rnd = opts.rnd || Math.random;
  const legal = pos.legal(); if (!legal.length) return null;
  if (!opts.noBook && moves && !opts.startFen && moves.length < L.book) {
    const bm = bookMove(moves, rnd);
    if (bm && pos.fromUci(bm)) return { move: bm, score: 0, depth: 0, book: true };
  }
  if (L.time) {
    const o = { timeMs: opts.timeMs != null ? opts.timeMs : L.time, depth: L.depth, nodes: opts.nodes };
    const r = think(pos, o);
    if (L.noise && r && Math.abs(r.score) < MATE_BOUND) {
      // pequeña variedad entre jugadas casi iguales
      const sc = rootScores(pos, 2, {});
      const top = sc.filter(x => x.sc >= sc.reduce((a, x) => Math.max(a, x.sc), -INF) - L.noise);
      if (top.length > 1 && top.some(x => pos.uci(x.m) === r.move) && rnd() < 0.25) { const pick = top[Math.floor(rnd() * top.length)]; return { move: pos.uci(pick.m), score: pick.sc, depth: 2 }; }
    }
    return r;
  }
  // niveles con azar: puntúa todas y elige con ruido
  if (L.blunder && rnd() < L.blunder) {
    const sc = rootScores(pos, 1, {});
    const pick = sc[Math.floor(rnd() * sc.length)];
    return { move: pos.uci(pick.m), score: pick.sc, depth: 1, blunder: true };
  }
  const sc = rootScores(pos, L.depth, { nodes: opts.nodes });
  let best = null, bv = -Infinity;
  for (const x of sc) {
    const mate = Math.abs(x.sc) > MATE_BOUND;
    const v = x.sc + (mate ? 0 : (rnd() * 2 - 1) * L.noise);
    if (v > bv) { bv = v; best = x; }
  }
  return { move: pos.uci(best.m), score: best.sc, depth: L.depth };
}

/* ---------- Problemas: mate forzado ---------- */
// Devuelve una jugada que da mate en n o menos (o 0). Memoriza resultados por posición.
function mateIn(pos, n, memo) {
  memo = memo || new Map();
  const key = pos.h1 + ':' + pos.h2 + ':' + n;
  if (memo.has(key)) return memo.get(key);
  const us = pos.turn;
  const moves = pos.legal();
  // primero los jaques, luego capturas
  const sc = moves.map(m => { pos.make(m); const ch = pos.inCheck() ? 2 : 0; pos.unmake(m); return ch + (((m >> 17) & F_CAP) ? 1 : 0); });
  const ord = moves.map((m, i) => [m, sc[i]]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  let found = 0;
  for (const m of ord) {
    pos.make(m);
    const replies = pos.legal();
    let ok;
    if (!replies.length) ok = pos.inCheck();
    else if (n <= 1) ok = false;
    else {
      ok = true;
      for (const r of replies) { pos.make(r); const w = mateIn(pos, n - 1, memo); pos.unmake(r); if (!w) { ok = false; break; } }
    }
    pos.unmake(m);
    if (ok) { found = m; break; }
  }
  memo.set(key, found);
  return found;
}
// Número mínimo de jugadas para dar mate (hasta max), o 0 si no hay
function mateDistance(pos, max, memo) { for (let n = 1; n <= max; n++) if (mateIn(pos, n, memo)) return n; return 0; }
// Mejor defensa: la respuesta que más retrasa el mate (o lo evita)
function bestDefense(pos, max, memo) {
  memo = memo || new Map();
  let best = 0, bestD = -1;
  for (const r of pos.legal()) {
    pos.make(r);
    const d = mateDistance(pos, max, memo);
    pos.unmake(r);
    const v = d === 0 ? 99 : d;
    if (v > bestD) { bestD = v; best = r; }
  }
  return best ? { move: pos.uci(best), mateIn: bestD === 99 ? 0 : bestD } : null;
}

/* ---------- Análisis de una partida ---------- */
// Clasifica la pérdida (en centésimas de peón) de una jugada
function classify(loss, isBest) {
  if (isBest) return 'mejor';
  if (loss >= 300) return 'grave';
  if (loss >= 130) return 'error';
  if (loss >= 60) return 'imprecision';
  return 'buena';
}
function capScore(s) { if (s > MATE_BOUND) return 2000; if (s < -MATE_BOUND) return -2000; return Math.max(-1500, Math.min(1500, s)); }


/* ---------- Peticiones de la app (Web Worker o, si no hay, el propio hilo) ---------- */
// d = { op, moves, startFen, ... }. progress(x) informa del avance (análisis).
function handle(d, progress) {
  const A2 = A;
  const pos = A2.replay(d.moves || [], d.startFen).pos;
  if (d.op === 'move') {
    const r = levelMove(pos, d.level, d.startFen ? null : d.moves, { startFen: d.startFen, timeMs: d.timeMs, nodes: d.nodes });
    return r;
  }
  if (d.op === 'best') return think(pos, { timeMs: d.timeMs || 600, depth: d.depth, analyse: true });
  if (d.op === 'analyse') {
    // Evalúa cada posición de la partida: mejor jugada y puntuación (desde el bando que juega)
    ttClear();
    const all = A2.replay(d.moves || [], d.startFen);
    const p = new A2.Position(d.startFen || A2.START_FEN);
    const out = [];
    const n = all.moves.length;
    for (let i = 0; i <= n; i++) {
      const st = A2.status(p);
      if (st.over) out.push({ best: null, score: st.reason === 'mate' ? -MATE : 0, over: true });
      else { const r = think(p, { timeMs: d.timeMs || 250, depth: d.depth || 14, analyse: true }); out.push({ best: r.move, score: r.score, depth: r.depth }); }
      if (progress) progress((i + 1) / (n + 1));
      if (i < n) p.make(p.fromUci(all.moves[i]));
    }
    return out;
  }
  if (d.op === 'mate') { const m = mateIn(pos, d.n); return m ? pos.uci(m) : null; }
  if (d.op === 'forced') {
    // ¿Sigue habiendo mate en n tras la jugada del atacante? (pos = turno del defensor)
    if (!pos.hasLegal()) return pos.inCheck();
    const memo = new Map();
    for (const r of pos.legal()) { pos.make(r); const w = mateIn(pos, d.n, memo); pos.unmake(r); if (!w) return false; }
    return true;
  }
  if (d.op === 'defense') return bestDefense(pos, d.n);
  throw new Error('Operación desconocida');
}

const API = { handle, evaluate, think, levelMove, rootScores, bookMove, mateIn, mateDistance, bestDefense, classify, capScore, ttClear, LEVELS, MATE, MATE_BOUND, BOOK_LINES };
root.Motor = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
