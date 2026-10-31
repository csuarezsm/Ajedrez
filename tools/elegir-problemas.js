// Elige los problemas más vistosos entre los candidatos y los añade a www/problemas.js
// sin cambiar los que ya existen (sus ids se conservan para no perder lo resuelto).
// Calcula también una dificultad aproximada (r) para el Elo de problemas.
// Uso: node tools/elegir-problemas.js candidatos1.json [candidatos2.json…]
const A = require('../www/ajedrez.js'); global.Ajedrez = A;
const M = require('../www/motor.js');
const fs = require('fs');
const OLD = require('../www/problemas.js');
const TARGET = { 1: 50, 2: 70, 3: 50 };
const V = [0, 1, 3, 3, 5, 9, 0];
function features(z) {
  const p = new A.Position(z.fen), us = p.turn;
  let mat = 0; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const q = p.b[s]; if (q) mat += ((q >> 3) === us ? 1 : -1) * V[q & 7]; }
  const nAtt = p.legal().length;
  const m = p.fromUci(z.sol[0]), from = A.mFrom(m), to = A.mTo(m), piece = p.b[from] & 7, cap = p.b[to] ? V[p.b[to] & 7] : 0;
  p.make(m);
  const check = p.inCheck(), attacked = p.attacked(to, p.turn);
  const sac = attacked && V[piece] > cap + 1 && piece !== A.KING;
  const quiet = !check && !cap && !(A.mFlags(m) & A.F_PROMO);
  // pieza que da el mate y casilla del rey mateado
  const q = new A.Position(z.fen); for (const u of z.sol) q.make(q.fromUci(u));
  const last = z.sol[z.sol.length - 1], mater = q.b[A.sqParse(last.slice(2, 4))] & 7;
  const ksq = q.kings[q.turn];
  let pieces = 0; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } if (q.b[s]) pieces++; }
  return { mat, check, sac, quiet, cap, mater, ksq, nAtt, pieces };
}
function beauty(z, f) {
  let b = 0;
  if (f.sac) b += 3;
  if (f.quiet && z.n > 1) b += 2.5;
  if (!f.check && z.n === 1) b += 1;
  if (f.mat <= 0) b += 2; else if (f.mat <= 3) b += 1; else if (f.mat >= 8) b -= 1.5;
  if (f.mater === A.KNIGHT || f.mater === A.BISHOP || f.mater === A.PAWN) b += 0.7;
  if (f.cap >= 5) b -= 0.7;                 // empezar comiéndose la dama es menos sorprendente
  b += Math.min(1, f.nAtt / 40);
  return b;
}
function rating(z, f) {
  let r = 700 + (z.n - 1) * 330;
  if (f.quiet) r += 160; if (f.sac) r += 140; if (!f.check) r += 60;
  r += Math.min(120, f.nAtt * 2);
  if (f.mat > 5) r -= 100;
  return Math.round(r / 10) * 10;
}
const seen = new Set(OLD.map(z => z.fen.split(' ').slice(0, 4).join(' ')));
const cands = [];
for (const file of process.argv.slice(2)) for (const z of JSON.parse(fs.readFileSync(file, 'utf8'))) {
  const k = z.fen.split(' ').slice(0, 4).join(' '); if (seen.has(k)) continue; seen.add(k);
  const f = features(z); cands.push({ z, f, b: beauty(z, f) });
}
const out = OLD.map(z => Object.assign({}, z, { r: rating(z, features(z)) }));
for (const n of [1, 2, 3]) {
  const have = out.filter(z => z.n === n).length, want = TARGET[n] - have;
  const pats = new Set(out.filter(z => z.n === n).map(z => { const f = features(z); return f.mater + ':' + f.ksq; }));
  const list = cands.filter(c => c.z.n === n).sort((a, b) => b.b - a.b);
  let k = have;
  for (const c of list) {
    if (k >= TARGET[n]) break;
    const pat = c.f.mater + ':' + c.f.ksq; if (pats.has(pat)) continue;   // variedad: no repetir pieza y casilla del mate
    pats.add(pat); k++;
    out.push({ id: 'm' + n + '-' + String(k).padStart(2, '0'), fen: c.z.fen, n, sol: c.z.sol, r: rating(c.z, c.f) });
  }
  console.log('mate en', n, ':', have, '→', k, '(candidatos', list.length + ')');
}
out.sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));
fs.writeFileSync(__dirname + '/../www/problemas.js',
`/* Ajedrez — problemas de mate (IT Canarias). © 2026 IT Canarias. Todos los derechos reservados.
   Generados con tools/buscar-candidatos.js y elegidos con tools/elegir-problemas.js a partir de partidas
   del motor propio. Todos comprobados: hay mate en N, no hay mate en menos y la primera jugada es la única.
   sol = solución en UCI (jugada, mejor defensa, jugada…) · r = dificultad aproximada (Elo de problemas). */
(function (root) {
const PROBLEMAS = ${JSON.stringify(out).replace(/\},\{/g, '},\n  {')};
root.PROBLEMAS = PROBLEMAS;
if (typeof module !== 'undefined' && module.exports) module.exports = PROBLEMAS;
})(typeof self !== 'undefined' ? self : globalThis);
`);
console.log('Total', out.length);
