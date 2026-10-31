// Mide la diferencia de fuerza entre niveles vecinos jugando partidas entre ellos.
// Los niveles por tiempo se limitan por nodos, como en un móvil de gama media (~100.000 nodos/s).
// Uso: node tools/calibrar-niveles.js "1-2:30,2-3:30" salida.json
// Resultado de la calibración de la 1.0.3 (puntos del nivel superior): 1→2 85 %, 2→3 85 %, 3→4 85 %,
// 4→5 93-95 %, 5→6 88 %. Diferencia en Elo de motor: 300, 300, 300, 500, 350; para los Elo de la app se
// comprime ×0,6 (entre motores las diferencias salen mayores que entre personas) y se fija el nivel 1 en 600.
const A = require('../www/ajedrez.js'); global.Ajedrez = A;
const M = require('../www/motor.js');
const fs = require('fs');
const NODES = { 5: 35000, 6: 250000 };
const pairs = (process.argv[2] || '1-2:10').split(',').map(x => { const [ab, n] = x.split(':'); const [a, b] = ab.split('-').map(Number); return { a, b, n: +n }; });
const file = process.argv[3] || 'calibracion.json';
let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
function game(lw, lb) {
  const pos = new A.Position(), moves = [];
  for (let ply = 0; ply < 300; ply++) {
    const st = A.status(pos); if (st.over) return st.result;
    const lv = pos.turn === 0 ? lw : lb;
    const r = M.levelMove(pos, lv, moves, { rnd, timeMs: 0, nodes: NODES[lv] });
    pos.make(pos.fromUci(r.move)); moves.push(r.move);
  }
  return '1/2-1/2';
}
const out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
for (const { a, b, n } of pairs) {
  const k = a + '-' + b; const o = out[k] || (out[k] = { g: 0, pts: 0 });
  for (let i = 0; i < n; i++) {
    const bw = i % 2 === 0, r = bw ? game(b, a) : game(a, b);   // pts = puntos del nivel b (el más alto)
    o.g++; o.pts += r === '1/2-1/2' ? 0.5 : ((r === '1-0') === bw ? 1 : 0);
    fs.writeFileSync(file, JSON.stringify(out));
  }
  console.log(k, o.pts + '/' + o.g);
}
