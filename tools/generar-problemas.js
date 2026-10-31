// Genera los problemas de mate (www/problemas.js) a partir de partidas del propio motor.
// Cada problema se comprueba con el buscador exacto: hay mate en N, no hay mate en menos
// y la primera jugada es la única que lo consigue.
// Uso: node tools/generar-problemas.js [partidas]
const A = require('../www/ajedrez.js'); global.Ajedrez = A;
const M = require('../www/motor.js');
const fs = require('fs');
const WANT = { 1: 24, 2: 24, 3: 18 };
const found = { 1: [], 2: [], 3: [] };
const seen = new Set();
let s = 4242; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const material = pos => { let w = 0, b = 0; const V = [0, 1, 3, 3, 5, 9, 0]; for (let q = 0; q < 128; q++) { if (q & 0x88) { q += 7; continue; } const p = pos.b[q]; if (p) { if (p >> 3) b += V[p & 7]; else w += V[p & 7]; } } return [w, b]; };
function solutionLine(pos, n) {
  const memo = new Map(), line = [];
  const p = pos.clone();
  for (let k = n; k >= 1; k--) {
    const m = M.mateIn(p, k, memo); if (!m) return null;
    line.push(p.uci(m)); p.make(m);
    if (k === 1) break;
    const d = M.bestDefense(p, k - 1, memo); if (!d) return null;
    line.push(d.move); p.make(p.fromUci(d.move));
  }
  return line;
}
let gotThisGame = {}, lastPly = -99, curPly = 0;
function check(pos) {
  if (curPly - lastPly < 8) return;
  const r = M.think(pos, { depth: 6, nodes: 120000, analyse: true });
  if (!r || r.score < M.MATE_BOUND) return;
  const n = Math.ceil((M.MATE - r.score) / 2);
  if (n < 1 || n > 3 || found[n].length >= WANT[n] || gotThisGame[n]) return;
  const key = pos.fen().split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) return;
  const memo = new Map();
  if (n > 1 && M.mateIn(pos, n - 1, memo)) return;
  if (!M.mateIn(pos, n, memo)) return;
  // única primera jugada
  let winners = 0;
  for (const m of pos.legal()) {
    pos.make(m);
    const replies = pos.legal();
    let ok;
    if (!replies.length) ok = pos.inCheck();
    else if (n === 1) ok = false;
    else { ok = true; for (const q of replies) { pos.make(q); const w = M.mateIn(pos, n - 1, memo); pos.unmake(q); if (!w) { ok = false; break; } } }
    pos.unmake(m);
    if (ok && ++winners > 1) return;
  }
  if (winners !== 1) return;
  const [w, b] = material(pos); const att = pos.turn ? b : w, def = pos.turn ? w : b;
  if (att - def > 12) return;              // nada de ventajas aplastantes
  const line = solutionLine(pos, n); if (!line) return;
  seen.add(key); gotThisGame[n] = true; lastPly = curPly;
  found[n].push({ fen: pos.fen(), n, sol: line });
  console.log('mate en', n, found[n].length, pos.fen(), line.join(' '));
}
const games = +process.argv[2] || 400;
for (let g = 0; g < games && (found[1].length < WANT[1] || found[2].length < WANT[2] || found[3].length < WANT[3]); g++) {
  const pos = new A.Position(); const moves = []; gotThisGame = {}; lastPly = -99;
  const lw = 2 + Math.floor(rnd() * 3), lb = 2 + Math.floor(rnd() * 3);
  for (let ply = 0; ply < 160; ply++) {
    if (A.status(pos).over) break;
    curPly = ply;
    if (ply >= 16) check(pos);
    const lv = pos.turn ? lb : lw;
    const r = M.levelMove(pos, lv, moves, { rnd, timeMs: 0, nodes: 8000 });
    pos.make(pos.fromUci(r.move)); moves.push(r.move);
  }
}
const all = [1, 2, 3].flatMap(n => found[n].map((p, i) => Object.assign({ id: 'm' + n + '-' + String(i + 1).padStart(2, '0') }, p)));
fs.writeFileSync(__dirname + '/../www/problemas.js',
`/* Ajedrez — problemas de mate (IT Canarias). © 2026 IT Canarias. Todos los derechos reservados.
   Generados con tools/generar-problemas.js a partir de partidas del motor propio y comprobados:
   hay mate en N, no hay mate en menos y la primera jugada es la única que lo consigue.
   sol = línea de solución en UCI (jugada, mejor defensa, jugada…). */
(function (root) {
const PROBLEMAS = ${JSON.stringify(all, null, 0).replace(/\},\{/g, '},\n  {')};
root.PROBLEMAS = PROBLEMAS;
if (typeof module !== 'undefined' && module.exports) module.exports = PROBLEMAS;
})(typeof self !== 'undefined' ? self : globalThis);
`);
console.log('Total', all.length, [1, 2, 3].map(n => found[n].length).join('/'));
