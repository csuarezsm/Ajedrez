// Busca candidatos a problemas de mate en partidas del motor y los va guardando en un JSON.
// Cada candidato está comprobado (mate en N exacto, sin mate más corto, primera jugada única).
// Uso: node tools/buscar-candidatos.js <semilla> <archivo.json> [minutos]
const A = require('../www/ajedrez.js'); global.Ajedrez = A;
const M = require('../www/motor.js');
const fs = require('fs');
const seed0 = +process.argv[2] || 1, file = process.argv[3] || 'candidatos.json', minutes = +process.argv[4] || 50;
const end = Date.now() + minutes * 60e3;
let s = seed0 * 7919 + 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const seen = new Set(out.map(c => c.fen.split(' ').slice(0, 4).join(' ')));
function solutionLine(pos, n) {
  const memo = new Map(), line = [], p = pos.clone();
  for (let k = n; k >= 1; k--) {
    const m = M.mateIn(p, k, memo); if (!m) return null;
    line.push(p.uci(m)); p.make(m); if (k === 1) break;
    const d = M.bestDefense(p, k - 1, memo); if (!d) return null;
    line.push(d.move); p.make(p.fromUci(d.move));
  }
  return line;
}
function check(pos) {
  let n = 0;
  if (M.mateIn(pos, 1)) n = 1;
  else {
    const r = M.think(pos, { depth: 5, nodes: 25000, analyse: true });
    if (!r || r.score < M.MATE_BOUND) return 0;
    n = Math.ceil((M.MATE - r.score) / 2);
    if (n < 2 || n > 3) return 0;
  }
  const key = pos.fen().split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) return 0;
  const memo = new Map();
  if (n > 1 && M.mateIn(pos, n - 1, memo)) return 0;
  if (!M.mateIn(pos, n, memo)) return 0;
  let winners = 0;
  for (const m of pos.legal()) {
    pos.make(m);
    const replies = pos.legal(); let ok;
    if (!replies.length) ok = pos.inCheck();
    else if (n === 1) ok = false;
    else { ok = true; for (const q of replies) { pos.make(q); const w = M.mateIn(pos, n - 1, memo); pos.unmake(q); if (!w) { ok = false; break; } } }
    pos.unmake(m);
    if (ok && ++winners > 1) return 0;
  }
  if (winners !== 1) return 0;
  const line = solutionLine(pos, n); if (!line) return 0;
  seen.add(key);
  out.push({ fen: pos.fen(), n, sol: line });
  fs.writeFileSync(file, JSON.stringify(out));
  return n;
}
let games = 0;
while (Date.now() < end) {
  games++;
  const pos = new A.Position(), moves = [];
  // un bando fuerte contra uno flojo da más posiciones de mate
  const strong = 3 + Math.floor(rnd() * 2), weak = 1 + Math.floor(rnd() * 2), sw = rnd() < 0.5;
  const got = {}; let lastPly = -99;
  for (let ply = 0; ply < 180 && Date.now() < end; ply++) {
    if (A.status(pos).over) break;
    if (ply >= 14 && ply - lastPly >= 6) { const n = check(pos); if (n && !got[n]) { got[n] = 1; lastPly = ply; } else if (n) { out.pop(); seen.delete(pos.fen().split(' ').slice(0, 4).join(' ')); fs.writeFileSync(file, JSON.stringify(out)); } }
    const lv = (pos.turn === 0) === sw ? strong : weak;
    const r = M.levelMove(pos, lv, moves, { rnd, timeMs: 0, nodes: 6000 });
    pos.make(pos.fromUci(r.move)); moves.push(r.move);
  }
}
console.log('partidas', games, 'candidatos', out.length, [1, 2, 3].map(n => out.filter(c => c.n === n).length).join('/'));
