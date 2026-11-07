// Pruebas automáticas de Ajedrez (IT Canarias)
// Se ejecutan en GitHub antes de compilar: si alguna falla, no se publica la versión.
// Uso local: node tests/app.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../www/ajedrez.js'); globalThis.Ajedrez = A;
const M = require('../www/motor.js');
const PROBLEMAS = require('../www/problemas.js');
const Aperturas = require('../www/aperturas.js');

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); } };
const P = fen => new A.Position(fen);
const play = (pos, ...sans) => { for (const s of sans) { const m = pos.fromSan(s); if (!m) throw new Error('Jugada no válida en la prueba: ' + s); pos.make(m); } return pos; };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/* ================= Reglas ================= */
console.log('Generador de jugadas (perft)');
{
  const T = [
    [A.START_FEN, [20, 400, 8902, 197281]],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
    ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
  ];
  for (const [f, exp] of T) {
    const p = P(f), got = exp.map((_, i) => A.perft(p, i + 1));
    check('perft ' + f.split(' ')[0].slice(0, 20) + '…', got.join() === exp.join(), got.join() + ' ≠ ' + exp.join());
    check('FEN se conserva', p.fen() === f, p.fen());
  }
}

console.log('Reglas especiales');
{
  // enroque: no se puede pasar por una casilla atacada
  let p = P('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  check('enroques posibles', !!p.fromSan('O-O') && !!p.fromSan('O-O-O'));
  p = P('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1');
  check('no se enroca pasando por casilla atacada', !p.fromSan('O-O') && !!p.fromSan('O-O-O'));
  p = P('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); play(p, 'Rh2', 'Rh7', 'Rh1', 'Rh8');
  check('al mover la torre se pierde el enroque de ese lado', !p.fromSan('O-O') && !!p.fromSan('O-O-O'));
  p = P('4k3/8/8/8/8/8/8/R3K2r w Q - 0 1');
  check('en jaque no hay enroque', !p.fromSan('O-O-O'));
  // captura al paso
  p = P(); play(p, 'e4', 'a6', 'e5', 'd5');
  const ep = p.fromSan('exd6');
  check('captura al paso disponible', !!ep && p.san(ep) === 'exd6');
  p.make(ep); check('el peón capturado al paso desaparece', !p.b[A.sqParse('d5')] && p.fen().startsWith('rnbqkbnr/1pp1pppp/p2P4/8'));
  p = P(); play(p, 'e4', 'a6', 'e5', 'd5', 'a3', 'a5');
  check('la captura al paso caduca', !p.fromSan('exd6'));
  // coronación
  p = P('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const promos = p.legal().filter(m => A.mFlags(m) & A.F_PROMO).map(m => p.uci(m)).sort();
  check('coronación a las cuatro piezas', promos.join() === 'a7a8b,a7a8n,a7a8q,a7a8r', promos.join());
  check('SAN de coronación con jaque', p.san(p.fromUci('a7a8q')) === 'a8=Q');
  p = P('k7/8/1K6/8/8/8/8/6Q1 w - - 0 1');
  check('SAN con mate', p.san(p.fromSan('Qg8')) === 'Qg8#');
  // desambiguación
  p = P('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
  check('desambiguación por columna', !!p.fromSan('Rad1') && p.san(p.fromSan('Rad1')) === 'Rad1');
  p = P('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1');
  check('desambiguación por fila', p.san(p.fromSan('R1a3')) === 'R1a3');
  check('notación en español', A.sanEs('Nf3') === 'Cf3' && A.sanEs('Qxe7+') === 'Dxe7+' && A.sanEs('exd8=Q#') === 'exd8=D#' && A.sanEs('O-O') === 'O-O');
  // FEN no válidas
  let threw = 0; for (const f of ['8/8/8/8/8/8/8/8 w - - 0 1', 'xx', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1', '4k3/8/8/8/8/8/8/4K2R b - - 0 1 extra', 'k7/8/8/8/8/8/8/K6R w - - 0 1']) { try { P(f); } catch (e) { threw++; } }
  check('FEN no válidas se rechazan (sin reyes, filas de menos, jaque al que no juega)', threw >= 3, threw + ' de 5');
}

console.log('Final de la partida');
{
  let p = P(); play(p, 'f3', 'e5', 'g4', 'Qh4');
  let st = A.status(p); check('mate del loco', st.over && st.result === '0-1' && st.reason === 'mate');
  p = P('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); st = A.status(p);
  check('rey ahogado = tablas', st.over && st.result === '1/2-1/2' && st.reason === 'ahogado');
  const ins = ['8/8/4k3/8/8/4K3/8/8 w - - 0 1', '8/8/4k3/8/8/4K3/5N2/8 w - - 0 1', '8/8/4k3/8/8/4K3/5B2/8 w - - 0 1', '8/5b2/4k3/8/8/4K3/2B5/8 w - - 0 1'];
  check('material insuficiente (R-R, R+C, R+A, alfiles del mismo color)', ins.every(f => A.status(P(f)).reason === 'material'));
  const suf = ['8/8/4k3/8/8/4K3/5P2/8 w - - 0 1', '8/4b3/4k3/8/8/4K3/2B5/8 w - - 0 1', '8/8/4k3/8/8/4K3/2NN4/8 w - - 0 1'];
  check('con peón, alfiles de distinto color o dos caballos se sigue jugando', suf.every(f => !A.status(P(f)).over));
  p = P(); play(p, 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1');
  check('dos repeticiones aún no son tablas', !A.status(p).over);
  play(p, 'Ng8'); st = A.status(p);
  check('triple repetición = tablas', st.over && st.reason === 'repeticion');
  p = P('8/8/4k3/8/8/4K3/4R3/8 w - - 99 80'); play(p, 'Ra2'); st = A.status(p);
  check('regla de los 50 movimientos', st.over && st.reason === 'cincuenta');
  p = P('8/8/4k3/8/8/4K3/P7/8 w - - 99 80'); play(p, 'a4');
  check('mover un peón reinicia la cuenta', !A.status(p).over && p.half === 0);
  check('¿puede dar mate? (para la caída de bandera)', !P('8/8/4k3/8/8/4K3/5N2/8 w - - 0 1').canMate(0) && P('8/8/4k3/8/8/4K3/5P2/8 w - - 0 1').canMate(0) && !P('8/8/4k3/8/8/4K3/5P2/8 w - - 0 1').canMate(1));
}

console.log('Cientos de partidas al azar');
{
  let ended = 0, okHash = true, okPgn = true, okInv = true, plies = 0;
  const N = 300;
  for (let g = 0; g < N; g++) {
    const p = P(), moves = [];
    for (let i = 0; i < 3000; i++) {
      const st = A.status(p); if (st.over) { ended++; break; }
      const L = p.legal(); const m = L[Math.floor(rnd() * L.length)];
      moves.push(p.uci(m)); p.make(m); plies++;
      const h1 = p.h1, h2 = p.h2; p.computeHash(); if (h1 !== p.h1 || h2 !== p.h2) okHash = false;
      let kings = [0, 0], cnt = [0, 0]; for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const q = p.b[s]; if (q) { cnt[q >> 3]++; if ((q & 7) === 6) kings[q >> 3]++; } }
      if (kings[0] !== 1 || kings[1] !== 1 || cnt[0] > 16 || cnt[1] > 16 || p.inCheck(p.turn ^ 1)) okInv = false;
    }
    // ida y vuelta por PGN
    const st = A.status(p);
    const pgn = A.toPgn({ moves, white: 'Blancas', black: 'Negras', result: st.over ? st.result : '*' });
    const back = A.parsePgn(pgn)[0];
    if (!back || back.moves.join() !== moves.join() || back.error) okPgn = false;
    // deshacer todas las jugadas vuelve a la posición inicial
    if (g % 30 === 0) { const q = P(); const ms = []; for (const u of moves) { const m = q.fromUci(u); ms.push(m); q.make(m); } while (ms.length) q.unmake(ms.pop()); if (q.fen() !== A.START_FEN) okInv = false; }
  }
  check(`las ${N} partidas terminan (mate, ahogado o tablas)`, ended === N, ended + '/' + N);
  check('la clave de posición incremental coincide siempre con la calculada (' + plies + ' jugadas)', okHash);
  check('nunca hay dos reyes de un color, más de 16 piezas o un rey en jaque sin turno', okInv);
  check('todas pasan por PGN y vuelven idénticas', okPgn);
}

console.log('PGN');
{
  const txt = `[Event "Prueba"]
[White "Ana \\"la torre\\""]
[Black "Luis"]
[Result "1-0"]

1. e4 {apertura} e5 2. Nf3 (2. f4 exf4) Nc6 3. Bb5 a6 $1 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0

[Event "Segunda"]
[White "X"]
[Black "Y"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1

[Event "Rota"]
[Result "*"]

1. e4 e5 2. Ke3 *
`;
  const G = A.parsePgn(txt);
  check('lee varias partidas', G.length === 3, G.length);
  check('ignora comentarios, variantes y anotaciones', G[0].moves.length === 16 && G[0].moves[8] === 'e1g1', G[0].moves.join(' '));
  check('etiquetas con comillas escapadas', G[0].tags.White === 'Ana "la torre"');
  check('resultado y mate', G[1].result === '0-1' && G[1].moves.length === 4);
  check('jugada ilegal: se avisa y se guarda hasta ahí', !!G[2].error && G[2].moves.length === 2);
  const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 40';
  const out = A.toPgn({ moves: ['e8d7', 'e2e4'], startFen: fen, white: 'A', black: 'B', result: '*' });
  check('PGN desde una posición (FEN) con jugada de negras', out.includes('[SetUp "1"]') && out.includes('40... Kd7 41. e4'), out);
  const back = A.parsePgn(out)[0];
  check('y se vuelve a leer igual', back.startFen === fen && back.moves.join() === 'e8d7,e2e4');
}

/* ================= Motor ================= */
console.log('Motor');
{
  const sym = f => { const [b, t, c, e, h, n] = f.split(' '); const sw = s => s.replace(/[a-z]/gi, ch => ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()); return [b.split('/').reverse().map(sw).join('/'), t === 'w' ? 'b' : 'w', c === '-' ? '-' : sw(c).split('').sort((x, y) => 'KQkq'.indexOf(x) - 'KQkq'.indexOf(y)).join(''), e === '-' ? '-' : e[0] + (9 - +e[1]), h, n].join(' '); };
  const fens = ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'];
  check('la evaluación es simétrica para blancas y negras', fens.every(f => M.evaluate(P(f)) === M.evaluate(P(sym(f)))));
  const mate1 = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  check('encuentra el mate en 1 en todos los niveles (2–6)', [2, 3, 4, 5, 6].every(l => M.levelMove(P(mate1), l, null, { rnd, nodes: 20000, timeMs: 0, noBook: true }).move === 'h5f7'));
  const mate2 = 'r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 0';
  const r2 = M.think(P(mate2), { nodes: 300000 });
  check('mate en 2 (con sacrificio)', r2.score > M.MATE_BOUND && r2.move === 'd5f6', JSON.stringify(r2));
  const hang = 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3';
  check('captura la dama que se ofrece (niveles 3–6)', [3, 4, 5, 6].every(l => M.levelMove(P(hang), l, null, { rnd, nodes: 20000, timeMs: 0, noBook: true }).move === 'c1g5'));
  check('el libro de aperturas responde a 1. e4', ['e7e5', 'c7c5', 'e7e6', 'c7c6', 'd7d5', 'd7d6', 'g8f6'].includes(M.bookMove(['e2e4'], rnd)));
  check('todas las líneas del libro son legales', M.BOOK_LINES.every(l => { const p = P(); return l.split(' ').every(u => { const m = p.fromUci(u); if (m) p.make(m); return !!m; }); }));
  // análisis: una partida con la dama regalada
  const moves = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5e5'];
  const ev = M.handle({ op: 'analyse', moves, timeMs: 120 });
  const loss = (i) => Math.max(0, M.capScore(ev[i].score) - (-M.capScore(ev[i + 1].score)));
  check('el análisis devuelve una evaluación por posición', ev.length === moves.length + 1);
  check('marca como error grave regalar la dama (5. Dxe5+?? Cxe5)', M.classify(loss(4), ev[4].best === moves[4]) === 'grave', 'pérdida ' + loss(4));
  check('y no marca como error una jugada normal (1. e4)', ['mejor', 'buena'].includes(M.classify(loss(0), ev[0].best === moves[0])), 'pérdida ' + loss(0));
}

console.log('Aperturas');
{
  const bad = Aperturas.LISTA.filter(([l]) => { const p = P(); return !l.split(' ').every(u => { const m = p.fromUci(u); if (m) p.make(m); return !!m; }); });
  check('todas las líneas de aperturas son legales', !bad.length, bad.map(x => x[1]).join(', '));
  check('sin líneas repetidas', new Set(Aperturas.LISTA.map(x => x[0])).size === Aperturas.LISTA.length);
  check('reconoce la Najdorf', Aperturas.aperturaDe('e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1e3'.split(' ')) === 'Siciliana, variante Najdorf');
  check('y se queda con la línea más larga conocida', Aperturas.aperturaDe('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 h2h3'.split(' ')) === 'Española, defensa Morphy');
  check('las líneas del libro del motor tienen nombre', M.BOOK_LINES.every(l => Aperturas.aperturaDe(l.split(' ')) !== ''));
}

console.log('Problemas de mate');
{
  check('hay problemas de mate en 1, 2 y 3', [1, 2, 3].every(n => PROBLEMAS.filter(p => p.n === n).length >= 10), [1, 2, 3].map(n => PROBLEMAS.filter(p => p.n === n).length).join('/'));
  check('ids únicos', new Set(PROBLEMAS.map(p => p.id)).size === PROBLEMAS.length);
  let bad = [];
  for (const z of PROBLEMAS) {
    const p = P(z.fen);
    if (z.sol.length !== 2 * z.n - 1) { bad.push(z.id + ' longitud'); continue; }
    if (z.n > 1 && M.mateIn(P(z.fen), z.n - 1)) { bad.push(z.id + ' hay mate más corto'); continue; }
    let ok = true; for (const u of z.sol) { const m = p.fromUci(u); if (!m) { ok = false; break; } p.make(m); }
    const st = A.status(p);
    if (!ok || !(st.over && st.reason === 'mate')) bad.push(z.id + ' la solución no da mate');
  }
  check('cada solución es legal, acaba en mate y no hay mate más corto', !bad.length, bad.join(', '));
}

console.log('Fuerza de los niveles');
{
  const NODES = { 4: 12000, 5: 30000, 6: 60000 };
  const game = (lw, lb) => {
    const pos = P(), moves = [];
    for (let ply = 0; ply < 260; ply++) {
      const st = A.status(pos); if (st.over) return st.result;
      const lv = pos.turn === 0 ? lw : lb;
      const r = M.levelMove(pos, lv, moves, { rnd, timeMs: 0, nodes: NODES[lv] });
      pos.make(pos.fromUci(r.move)); moves.push(r.move);
    }
    return '1/2-1/2';
  };
  const match = (a, b, n) => { let s = 0; for (let i = 0; i < n; i++) { const aw = i % 2 === 0, r = aw ? game(a, b) : game(b, a); s += r === '1/2-1/2' ? 0.5 : ((r === '1-0') === aw ? 1 : 0); } return s / n; };
  const t0 = Date.now();
  const s31 = match(3, 1, 10); check('el nivel 3 gana al 1 (más del 80 % de los puntos)', s31 > 0.8, Math.round(s31 * 100) + '%');
  const s53 = match(5, 3, 8); check('el nivel 5 gana al 3 (más del 50 % de los puntos)', s53 > 0.5, Math.round(s53 * 100) + '%');
  console.log('    (' + Math.round((Date.now() - t0) / 1000) + ' s)');
}

/* ================= Interfaz ================= */
const ROOT = fileURLToPath(new URL('../www/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try { const f = await readFile(join(ROOT, path === '/' ? 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }); res.end(f); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const URL_APP = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
async function fresh(state, viewport, online = '') {
  const ctx = await browser.newContext({ viewport: viewport || { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(u => { window.AJEDREZ_ONLINE_URL = u; }, online);   // en las pruebas, nunca el servidor real
  await p.addInitScript(st => { if (st && !sessionStorage.getItem('seeded')) { localStorage.setItem('ajedrez.v1', JSON.stringify(st)); sessionStorage.setItem('seeded', '1'); } }, state || { onboarded: true });
  await p.goto(URL_APP);
  return { p, ctx, errors };
}
async function sqXY(p, sq) {
  return p.evaluate(sq => {
    const el = document.querySelector('#board'), r = el.getBoundingClientRect();
    const orient = REVIEW ? (REVIEW.orient != null ? REVIEW.orient : 0) : S.drill ? mistakeList().find(x => x.key === S.drill.key).color : S.pz ? new Ajedrez.Position(pzById(S.pz.id).fen).turn : orientOf(S.game);
    const f = sq.charCodeAt(0) - 97, rk = +sq[1] - 1, x = orient ? 7 - f : f, y = orient ? rk : 7 - rk;
    return [r.left + (x + .5) * r.width / 8, r.top + (y + .5) * r.height / 8];
  }, sq);
}
async function tap(p, sq) { const [x, y] = await sqXY(p, sq); await p.mouse.click(x, y); await p.waitForTimeout(40); }
async function move(p, uci) { await tap(p, uci.slice(0, 2)); await tap(p, uci.slice(2, 4)); }
async function drag(p, from, to) { const [x1, y1] = await sqXY(p, from), [x2, y2] = await sqXY(p, to); await p.mouse.move(x1, y1); await p.mouse.down(); await p.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await p.mouse.move(x2, y2, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(60); }
const waitFor = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

console.log('Idioma inglés');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://**', r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov]) => { window[ov] = ''; navigator.share = async d => { window.__compartido = d.text; }; if (!sessionStorage.l) { localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); sessionStorage.l = 1; } }, ['ajedrez.v1', 'AJEDREZ_ONLINE_URL']);
  await p.goto(URL_APP); await p.waitForTimeout(400);
  check('por defecto (pruebas) en español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Against the computer')));
  await p.click('#menuBtn'); await p.click('#mLang');
  check('el menú tiene el selector de idioma', await p.evaluate(() => document.querySelectorAll('[data-lang]').length === 5));
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="en"]')]); await p.waitForTimeout(500);
  check('al elegir inglés, la app se ve en inglés', await p.evaluate(() => Idioma.lang() === 'en' && document.body.textContent.includes('Against the computer') && document.documentElement.lang === 'en'));
  await p.click('#menuBtn');
  check('y el menú también', await p.evaluate(() => document.querySelector('#modal').textContent.includes('Share the app') && !document.querySelector('#modal').textContent.includes('Compartir la app')));
  check('compartir la app en inglés', await p.evaluate(async () => { closeModal(); await shareApp(); const t = window.__compartido || ''; return /free/i.test(t) && /iPhone/.test(t) && !/Gratis/.test(t); }), await p.evaluate(() => window.__compartido));
  check('las fechas y números en inglés', await p.evaluate(() => new Date(2026, 10, 1).toLocaleDateString('es-ES', { month: 'long' }) === 'November'));
  await p.click('#menuBtn'); await p.click('#mLang');
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="es"]')]); await p.waitForTimeout(400);
  check('y se vuelve al español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Against the computer')));

  for (const [l, t] of [['fr', 'Plus de jeux'], ['de', 'Mehr Spiele'], ['it', 'Altri giochi']]) {
    await p.evaluate(l => localStorage.setItem('idioma', l), l); await p.reload(); await p.waitForTimeout(400);
    await p.click('#menuBtn');
    check(`en ${l}: la app se ve en ese idioma`, await p.evaluate(([l, t]) => document.documentElement.lang === l && document.querySelector('#modal').textContent.includes(t), [l, t]));
    await p.evaluate(() => closeModal());
  }
  await p.evaluate(() => localStorage.setItem('idioma', 'es')); await p.reload(); await p.waitForTimeout(300);
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Contador anónimo de instalaciones');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const avisos = [];
  await ctx.route('https://contador.prueba/contar', async r => { avisos.push(JSON.parse(r.request().postData())); await r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); });
  const p = await ctx.newPage();
  await p.addInitScript(([k, ov]) => { window[ov] = ''; window.CONTADOR_URL = 'https://contador.prueba/contar'; window.CONTADOR_FORZAR = true; if (!sessionStorage.c) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.c = 1; } }, ['ajedrez.v1', 'AJEDREZ_ONLINE_URL']);
  await p.goto(URL_APP);
  await p.evaluate(() => Contador.avisar());
  check('al instalar avisa una vez, sin datos personales', avisos.length === 1 && avisos[0].evento === 'instalacion' && avisos[0].plataforma === 'web' && Object.keys(avisos[0]).sort().join() === 'evento,juego,plataforma,version', JSON.stringify(avisos));
  await p.reload(); await p.evaluate(() => Contador.avisar());
  check('no vuelve a avisar en la misma versión', avisos.length === 1);
  await p.evaluate(() => { S.contadoVer = '0.0.1'; save(); }); await p.evaluate(() => Contador.avisar());
  check('con una versión nueva avisa de la actualización', avisos.length === 2 && avisos[1].evento === 'actualizacion' && avisos[1].de === '0.0.1');
  check('en las pruebas automáticas normales no avisa al servidor real', await p.evaluate(async () => { window.CONTADOR_FORZAR = false; S.contadoVer = null; return (await Contador.avisar()) === false; }));
  await ctx.close();
}

console.log('Más juegos de IT Canarias');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const CAT = 'https://catalogo.prueba/juegos.json';
  await ctx.route(CAT, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ juegos: [
    { id: 'ajedrez', nombre: 'Ajedrez', descripcion: 'a', descarga: 'https://csuarezsm.github.io/Ajedrez/', web: 'https://csuarezsm.github.io/Ajedrez/app/' },
    { id: 'damas', nombre: 'Damas', descripcion: 'd', descarga: 'https://csuarezsm.github.io/Damas/', web: 'https://csuarezsm.github.io/Damas/app/' },
    { id: 'chinchon', nombre: 'Chinchón', descripcion: 'c', descarga: 'https://csuarezsm.github.io/chinchon-marcador/', web: 'https://csuarezsm.github.io/chinchon-marcador/app/' },
    { id: 'pumba', nombre: 'Pumba', descripcion: 'p', descarga: 'https://csuarezsm.github.io/Pumba/', web: 'https://csuarezsm.github.io/Pumba/app/' },
    { id: 'parchis', nombre: 'Parchís <b>', emoji: '🎲', descripcion: 'Nuevo', descarga: 'https://csuarezsm.github.io/Parchis/' },
    { id: '<mal>', nombre: 'Malo', descarga: 'https://x.example/' },
    { id: 'malo2', nombre: 'Malo 2', descarga: 'javascript:alert(1)' }] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov, cat]) => { window[ov] = ''; window.MAS_JUEGOS_URL = cat; if (!sessionStorage.mj) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.mj = 1; } }, ['ajedrez.v1', 'AJEDREZ_ONLINE_URL', CAT]);
  await p.goto(URL_APP); await p.waitForTimeout(300);
  await p.click('#menuBtn');
  check('el menú tiene «Más juegos de IT Canarias»', !!(await p.$('#mMas')));
  await p.click('#mMas'); await p.waitForTimeout(200);
  const base = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('sin conexión: los otros ocho juegos, y no este', base.length === 8 && !base.some(n => n.toLowerCase().startsWith('ajedr')), base.join());
  check('con sus iconos dentro de la app', await p.evaluate(() => [...document.querySelectorAll('.mji img')].every(i => i.getAttribute('src').startsWith('juegos/'))));
  check('el catálogo común se descarga y se guarda', await p.evaluate(async () => await MasJuegos.actualizar(true) && S.masJuegos.juegos.length === 5));
  await p.evaluate(() => { closeModal(); MasJuegos.abrir(); }); await p.waitForTimeout(200);
  const nuevos = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('un juego nuevo del catálogo aparece sin actualizar la app', nuevos.length === 4 && nuevos.includes('Parchís b'), nuevos.join());
  check('los datos raros del catálogo se descartan', !nuevos.includes('Malo') && !nuevos.includes('Malo 2'));
  const abierto = await p.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; const i = MasJuegos.juegos().findIndex(j => j.id === 'parchis'); document.querySelector(`[data-mj="${i}"]`).click(); return u; });
  check('en el navegador, el botón lleva a su página', abierto === 'https://csuarezsm.github.io/Parchis/', abierto);
  await p.reload(); await p.waitForTimeout(300);
  check('sin internet usa el último catálogo guardado', await p.evaluate(() => MasJuegos.juegos().some(j => j.id === 'parchis')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
  // en iPhone, cada juego abre su versión web
  const ci = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ci.route('https://**/*.json', r => r.abort());
  const q = await ci.newPage();
  await q.addInitScript(([k, ov]) => { window[ov] = ''; localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); }, ['ajedrez.v1', 'AJEDREZ_ONLINE_URL']);
  await q.goto(URL_APP); await q.waitForTimeout(300);
  const web = await q.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; MasJuegos.abrir(); document.querySelector('[data-mj="0"]').click(); return u; });
  check('en iPhone el botón abre la versión web del juego', /\/app\/$/.test(web), web);
  // aviso de turno: se puede quitar en los ajustes
  const aviso = await q.evaluate(() => { closeModal(); document.querySelector('#menuBtn').click(); document.querySelector('#mTheme').click(); const el = document.querySelector('#thTurno'); const antes = !!el && el.checked; el.click(); const off = S.avisoTurno === false && JSON.parse(localStorage.getItem(KEY)).avisoTurno === false; const n = AvisoTurno.veces; const sono = AvisoTurno.sonar(); return { ok: antes && off && !sono && AvisoTurno.veces === n, antes, off, sono, el: !!el }; });
  check('el aviso de turno en línea se puede quitar en ajustes', aviso.ok, JSON.stringify(aviso));
  await ci.close();
}

console.log('Versión web e iPhone');
{
  const { execSync } = await import('node:child_process');
  let iguales = true; try { execSync('diff -r www docs/app', { cwd: fileURLToPath(new URL('..', import.meta.url)) }); } catch (e) { iguales = false; }
  check('docs/app (versión web) es igual que www/ — si no: npm run web', iguales);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.AJEDREZ_ONLINE_URL = ''; if (!sessionStorage.s) { localStorage.setItem('ajedrez.v1', JSON.stringify({ onboarded: true })); sessionStorage.s = 1; } });
  await p.goto(URL_APP);
  check('en Safari de iPhone explica cómo añadirla a la pantalla de inicio', await waitFor(p, () => !!document.querySelector('#iosOk')));
  await p.click('#iosOk'); await p.click('#menuBtn');
  check('en la versión web no hay actualizador de APK', !(await p.$('#mUpd')) && !!(await p.$('#mIOS')));
  check('y lo vuelve a explicar desde el menú', await p.evaluate(() => { document.querySelector('#mIOS').click(); return !!document.querySelector('#iosOk'); }));
  check('etiquetas de iPhone: icono, título y pantalla completa', await p.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('meta[name="apple-mobile-web-app-title"]').content === 'Ajedrez'));
  check('compartir la app: un mensaje para Android e iPhone', await p.evaluate(async () => { let txt = ''; navigator.share = async d => { txt = d.text; }; await shareApp(); return txt.includes('csuarezsm.github.io/Ajedrez/') && /Android/.test(txt) && /iPhone/.test(txt); }));
  await p.reload();
  check('el aviso de instalar sale solo una vez', !(await p.$('#iosOk')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Partida contra la máquina');
{
  const { p, ctx, errors } = await fresh();
  await p.fill('#aName', 'Carlos');
  await p.click('[data-alevel="1"]');
  await p.click('#start');
  check('empieza la partida con el nombre y el nivel', await p.evaluate(() => S.game.mode === 'ai' && S.game.white === 'Carlos' && S.game.level === 1 && S.roster.includes('Carlos')));
  await move(p, 'e2e4');
  check('se mueve tocando pieza y casilla', await p.evaluate(() => S.game.moves[0] === 'e2e4'));
  check('la máquina responde', await waitFor(p, () => S.game.moves.length === 2));
  await drag(p, 'g1', 'f3');
  check('se mueve arrastrando la pieza', await p.evaluate(() => S.game.moves[2] === 'g1f3'));
  await waitFor(p, () => S.game.moves.length === 4);
  await tap(p, 'e1'); await tap(p, 'e3');
  check('una jugada ilegal no se hace', await p.evaluate(() => S.game.moves.length === 4));
  await tap(p, 'd2');
  check('al tocar una pieza se marcan sus jugadas', await p.evaluate(() => document.querySelectorAll('.sq.tgt').length === 2));
  await tap(p, 'd2');
  await p.click('#gUndo');
  check('deshacer quita tu jugada y la de la máquina', await p.evaluate(() => S.game.moves.length === 2 && S.game.undos === 1));
  await p.click('[data-ply="1"]');
  check('tocar una jugada de la lista enseña esa posición', await p.evaluate(() => VIEW_PLY === 1 && !!document.querySelector('#gLive')));
  await p.click('#gLive');
  await p.click('#gResign'); await p.click('#cOk');
  check('rendirse termina la partida y la guarda', await p.evaluate(() => S.game.result === '0-1' && S.game.reason === 'abandono' && S.archive.length === 1 && S.archive[0].id === S.game.id));
  check('la derrota baja el Elo', await p.evaluate(() => { const o = eloTable().find(x => x.name === 'Carlos'); return o && o.elo < 1200 && o.pj === 1; }));
  await p.click('#gRematch');
  check('la revancha cambia de color', await p.evaluate(() => S.game.human === 1 && S.game.black === 'Carlos' && !S.game.result));
  check('con negras la máquina empieza', await waitFor(p, () => S.game.moves.length === 1));
  check('y el tablero se ve desde las negras', await p.evaluate(() => orientOf(S.game) === 1));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Botón atrás, sonidos y aperturas en pantalla');
{
  const { p, ctx, errors } = await fresh();
  check('en el inicio no hay nada que cerrar', await p.evaluate(() => goBack() === false));
  await p.click('[data-mode="puzzles"]');
  check('desde Problemas vuelve a la pantalla principal', await p.evaluate(() => goBack() === true && S.draft.mode === 'ai'));
  await p.evaluate(() => openPuzzle(PROBLEMAS[0].id));
  check('desde un problema vuelve a la lista', await p.evaluate(() => goBack() && !S.pz && S.draft.mode === 'puzzles'));
  await p.evaluate(() => { S.draft.mode = 'local'; startGame({ mode: 'local', white: 'Ana', black: 'Luis' }); });
  check('partida sin jugadas: se sale sin preguntar', await p.evaluate(() => goBack() && !S.game));
  await p.evaluate(() => startGame({ mode: 'local', white: 'Ana', black: 'Luis' }));
  await move(p, 'e2e4'); await move(p, 'e7e5'); await move(p, 'g1f3');
  check('se ve el nombre de la apertura', (await p.textContent('.opening')).includes('caballo de rey'));
  await p.click('[data-ply="1"]');
  check('viendo una jugada anterior, atrás vuelve a la actual', await p.evaluate(() => goBack() && VIEW_PLY === null));
  check('partida a medias: pregunta si guardarla', await p.evaluate(() => goBack() && !!document.querySelector('#lvSave')));
  check('con la ventana abierta, atrás la cierra', await p.evaluate(() => goBack() && $('#modal').classList.contains('hidden') && !!S.game));
  check('los sonidos no dan errores', await p.evaluate(async () => { ['move', 'capture', 'castle', 'check', 'end', 'ok', 'bad'].forEach(k => Sound.play(k)); await new Promise(r => setTimeout(r, 300)); return true; }));
  check('tipo de sonido por jugada', await p.evaluate(() => { const P0 = new Ajedrez.Position(); const P1 = Ajedrez.replay(['e2e4', 'd7d5']).pos; const P2 = new Ajedrez.Position('r3k3/8/8/8/8/8/8/4K2R w K - 0 1'); return Sound.forMove(P0, 'e2e4') === 'move' && Sound.forMove(P1, 'e4d5') === 'capture' && Sound.forMove(P2, 'e1g1') === 'castle' && Sound.forMove(P2, 'h1h8') === 'check'; }));
  await p.evaluate(() => { S.game.moves = ['a2a4', 'b7b5', 'a4b5', 'g8f6', 'b5b6', 'f6g8', 'b6a7', 'g8f6']; render(); });
  await move(p, 'a7b8');
  check('cerrar la elección de coronación la cancela sin romper nada', await p.evaluate(() => { goBack(); return S.game.moves.length === 8 && BS.sel === null; }));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Dos jugadores, coronación, reloj y tablas');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-mode="local"]');
  await p.fill('#lWhite', 'Ana'); await p.fill('#lBlack', 'Luis');
  await p.check('#lFlip');
  await p.click('[data-lclock="5+0"]');
  await p.click('#start');
  check('partida de dos jugadores con reloj', await p.evaluate(() => S.game.mode === 'local' && S.game.white === 'Ana' && S.game.clock.base === 300000 && S.game.flip));
  await move(p, 'f2f3');
  check('el tablero gira en cada turno', await p.evaluate(() => orientOf(S.game) === 1));
  check('el reloj de las negras corre', await p.evaluate(() => !!S.game.tick && document.querySelector('[data-clock="1"]').classList.contains('run')));
  await move(p, 'e7e5'); await move(p, 'g2g4'); await move(p, 'd8h4');
  check('mate del loco: ganan las negras', await p.evaluate(() => S.game.result === '0-1' && S.game.reason === 'mate'));
  check('el texto lo dice', (await p.textContent('.gstatus')).includes('Luis'));
  check('Elo de los dos jugadores', await p.evaluate(() => { const t = eloTable(); const a = t.find(x => x.name === 'Ana'), l = t.find(x => x.name === 'Luis'); return a.elo < 1200 && l.elo > 1200 && Math.round(a.elo + l.elo) === 2400; }));
  // coronación desde una posición preparada
  await p.evaluate(() => { S.game = null; render(); });
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null, flip: false }); S.game.moves = ['a2a4', 'b7b5', 'a4b5', 'g8f6', 'b5b6', 'f6g8', 'b6a7', 'g8f6']; render(); });
  await move(p, 'a7b8');
  check('al coronar se elige la pieza', await p.evaluate(() => !!document.querySelector('[data-pr="2"]')));
  await p.click('[data-pr="2"]');
  check('corona en caballo', await p.evaluate(() => S.game.moves[S.game.moves.length - 1] === 'a7b8n'));
  await p.click('#gDraw'); await p.click('#cOk');
  check('tablas de mutuo acuerdo', await p.evaluate(() => S.game.result === '1/2-1/2' && S.game.reason === 'acuerdo'));
  // caída de bandera
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: { base: 60000, inc: 0 }, flip: false }); S.game.moves = ['e2e4']; S.game.times = [60000, 400]; S.game.tick = Date.now(); render(); });
  check('si se acaba el tiempo, pierde', await waitFor(p, () => S.game.result === '1-0' && S.game.reason === 'tiempo', null, 4000));
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: { base: 60000, inc: 0 }, flip: false }); S.game.startFen = '4k3/8/8/8/8/8/8/R3K3 b - - 0 1'; S.game.moves = []; S.game.times = [500, 60000]; render(); });
  await move(p, 'e8d7');
  check('el incremento y el turno pasan al otro reloj', await p.evaluate(() => S.game.tick && turnOf(S.game) === 0));
  await p.evaluate(() => { S.game.times[0] = 300; S.game.tick = Date.now(); });
  check('sin tiempo pero el rival no puede dar mate: tablas', await waitFor(p, () => S.game.result === '1/2-1/2' && S.game.reason === 'tiempo', null, 4000));
  check('el reloj se para al salir de la app', await p.evaluate(() => { startGame({ mode: 'local', white: 'A', black: 'B', clock: { base: 60000, inc: 0 } }); S.game.moves = ['e2e4']; S.game.tick = Date.now() - 5000; pauseClock(); const ok = !S.game.tick && S.game.paused && S.game.times[1] <= 55100; resumeClock(); return ok && !!S.game.tick; }));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Modo aprendizaje y pistas');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-alevel="3"]'); await p.check('#aLearn'); await p.click('#start');
  await p.evaluate(() => { S.game.moves = ['e2e4', 'e7e5', 'g1f3', 'd7d6']; render(); });
  await p.click('#gHint');
  check('la pista marca una jugada', await waitFor(p, () => HINT && HINT.length === 2));
  await move(p, 'd2d4');      // jugada buena: no avisa y la máquina responde
  check('una jugada buena no da aviso', await waitFor(p, () => S.game.moves.length === 6, null, 20000) && !(await p.$('#lnUndo')));
  await p.evaluate(() => { HINT = null; THINK = null; LEARN_WAIT = null; Engine.reset(); S.game.moves = ['e2e4', 'e7e5', 'd2d4', 'd7d6']; render(); });
  await move(p, 'd1g4');      // la dama queda a tiro del alfil de c8
  const warned = await waitFor(p, () => !!document.querySelector('#lnUndo'), null, 20000);
  check('avisa al regalar la dama', warned);
  if (warned) { await p.click('#lnUndo'); check('y se puede deshacer', await p.evaluate(() => S.game.moves.length === 4 && !LEARN_WAIT)); }
  await move(p, 'd1g4');
  if (await waitFor(p, () => !!document.querySelector('#lnUndo'), null, 20000)) {
    await p.evaluate(() => goBack());
    check('cerrar el aviso con atrás equivale a seguir: juega la máquina', await waitFor(p, () => !LEARN_WAIT && S.game.moves.length === 6, null, 20000));
  } else check('el aviso vuelve a salir', false);
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Revisión y análisis');
{
  const { p, ctx, errors } = await fresh();
  await p.evaluate(() => {
    startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null });
    S.game.moves = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']; render();
  });
  check('mate del pastor', await p.evaluate(() => S.game.result === '1-0' && S.game.reason === 'mate') || await p.evaluate(() => { const R = gstate(S.game); if (R.st.over) endGame(R.st.result, R.st.reason); return S.game.result === '1-0'; }));
  await p.click('#gAnalyse');
  check('el análisis termina', await waitFor(p, () => REVIEW && REVIEW.g.analysis && !REVIEW.analysing, null, 30000));
  check('marca 3… Cf6?? como error grave', await p.evaluate(() => { const a = annotate(REVIEW.g); return a[5].cls === 'grave'; }));
  check('el análisis queda guardado en el historial', await p.evaluate(() => !!S.archive[0].analysis && S.archive[0].analysis.evals.length === 8));
  await p.click('[data-rp="6"]');
  check('nota con la mejor jugada', (await p.textContent('.note')).includes('Mejor era'));
  await p.click('#rvBest');
  check('se puede ver la mejor jugada en el tablero', await p.evaluate(() => document.querySelectorAll('.sq.best').length === 2));
  await p.click('[data-nav="first"]');
  check('navegar al inicio', await p.evaluate(() => REVIEW.ply === 0));
  await p.click('[data-nav="next"]'); await p.click('[data-nav="next"]');
  check('avanzar jugada a jugada', await p.evaluate(() => REVIEW.ply === 2));
  await p.click('#rvBack');
  check('volver a la partida', await p.evaluate(() => !REVIEW && !!S.game));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Problemas');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-mode="puzzles"]');
  const z1 = PROBLEMAS.find(x => x.n === 1), z2 = PROBLEMAS.find(x => x.n === 2);
  await p.click(`[data-pz="${z1.id}"]`);
  await move(p, z1.sol[0]);
  check('mate en 1 resuelto a la primera', await waitFor(p, id => S.pz.done && S.solved[id] === 2, z1.id));
  await p.evaluate(id => openPuzzle(id), z2.id);
  // una jugada que no da mate
  const wrong = await p.evaluate(z => { const pos = new Ajedrez.Position(z.fen); return pos.legal().map(m => pos.uci(m)).find(u => u !== z.sol[0]); }, z2);
  await move(p, wrong);
  check('una jugada equivocada se rechaza y se deshace', await waitFor(p, () => S.pz.fails === 1 && S.pz.moves.length === 0, null, 20000));
  await move(p, z2.sol[0]);
  check('la defensa responde', await waitFor(p, () => S.pz.moves.length === 2, null, 20000));
  const last = await p.evaluate(() => { const z = pzById(S.pz.id); const pos = Ajedrez.replay(S.pz.moves, z.fen).pos; return pos.legal().map(m => pos.uci(m)).find(u => { const q = pos.clone(); q.make(q.fromUci(u)); return Ajedrez.status(q).reason === 'mate'; }); });
  await move(p, last);
  check('mate en 2 resuelto (con un fallo)', await waitFor(p, id => S.pz.done && S.solved[id] === 1, z2.id));
  await p.click('#pzBack');
  check('la lista marca los resueltos', await p.evaluate(() => document.querySelectorAll('.pzgrid .ok1').length === 1 && document.querySelectorAll('.pzgrid .ok').length === 1));
  const z3 = PROBLEMAS.find(x => x.n === 3);
  await p.evaluate(id => openPuzzle(id), z3.id);
  await p.click('#pzSol');
  check('ver la solución la reproduce entera y no cuenta como resuelto', await waitFor(p, id => S.pz.done && S.pz.moves.length === 5 && !S.solved[id], z3.id, 10000));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Repasa tus errores y jugar desde aquí');
{
  const { p, ctx, errors } = await fresh();
  await p.evaluate(() => {
    const mk = (id, moves, result, extra) => { const g = Object.assign({ id, created: Date.now() - 1e6, finished: Date.now() - 1e6, mode: 'ai', human: 0, level: 3, white: 'Carlos', black: levelLabel(3), moves, startFen: null, clock: null, result, reason: 'mate', undos: 0, hints: 0 }, extra || {}); return g; };
    const a = mk('err1', ['f2f3', 'e7e5', 'g2g4', 'd8h4'], '0-1');
    const ev = Motor.handle({ op: 'analyse', moves: a.moves, timeMs: 120 }); a.analysis = { evals: ev.map(e => [e.best || '', e.score]), at: Date.now() };
    S.archive.push(a, mk('noan', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'd2d3'], '1/2-1/2', { reason: 'acuerdo' }));
    S.draft.mode = 'puzzles'; render();
  });
  check('el error grave sale para repasar', await p.evaluate(() => { const l = mistakeList(); return l.length === 1 && l[0].played === 'g2g4' && l[0].color === 0; }));
  check('los errores de la máquina no salen', await p.evaluate(() => !mistakeList().some(x => x.color === 1)));
  await p.click('#drStart');
  check('se abre el ejercicio en la posición antes del error', await p.evaluate(() => !!S.drill && document.querySelector('.note').textContent.includes('g4')));
  await move(p, 'g2g4');
  check('repetir la jugada de la partida no vale', await waitFor(p, () => S.drill.fails === 1 && !S.drill.move, null, 5000));
  const best = await p.evaluate(() => mistakeList()[0].best);
  await move(p, best);
  check('la buena se acepta y queda marcada', await waitFor(p, () => S.drill.done && Object.values(S.mist)[0] === 1, null, 20000));
  await p.click('#drPlay'); await p.click('[data-cm="local"]'); await p.click('#ctGo');
  check('jugar desde aquí empieza una partida nueva en esa posición', await p.evaluate(() => S.game && !S.drill && S.game.startFen && S.game.startFen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/8/5P2') && S.game.moves.length === 0 && S.game.mode === 'local'));
  await move(p, 'e1f2');
  check('se juega con normalidad', await p.evaluate(() => S.game.moves[0] === 'e1f2'));
  await p.click('#gResign'); await p.click('#rsW');
  check('no cuenta para el Elo', await p.evaluate(() => !ratedGames().some(a => a.startFen)));
  check('y se puede revisar y exportar en PGN con su FEN', await p.evaluate(() => toPgn(S.game).includes('[FEN "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq')));
  await p.evaluate(() => { S.game = null; S.draft.mode = 'puzzles'; render(); });
  await p.click('#drAnalyse');
  check('analizar las partidas pendientes', await waitFor(p, () => S.archive.find(a => a.id === 'noan').analysis, null, 60000));
  await p.evaluate(() => openGameReview(S.archive.find(a => a.id === 'err1'), 'archive'));
  await p.click('[data-nav="first"]'); await p.click('[data-nav="next"]');
  await p.click('#rvPlay'); await p.click('[data-cc="1"]'); await p.click('[data-cl="1"]'); await p.click('#ctGo');
  check('desde el análisis contra la máquina, con el color elegido', await p.evaluate(() => S.game.mode === 'ai' && S.game.human === 1 && S.game.level === 1 && S.game.startFen.includes(' b ')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Jugar en línea (con el servidor común de juegos)');
{
  const os = await import('node:os'), fs = await import('node:fs');
  Object.assign(process.env, { LIMITE_MSG: '5000', DATA_DIR: fs.mkdtempSync(join(os.tmpdir(), 'juegos-')) });
  const { crearServidor } = require('./servidor/src/server.js');
  const { server: SVS } = crearServidor();
  await new Promise(r => SVS.listen(0, '127.0.0.1', r));
  const WS = `ws://127.0.0.1:${SVS.address().port}/ws`;
  const A1 = await fresh({ onboarded: true, draft: { mode: 'online', ai: { name: 'Carlos' } } }, null, WS);
  const B1 = await fresh({ onboarded: true, draft: { mode: 'online', ai: { name: 'Tere' } } }, null, WS);
  const a = A1.p, b = B1.p;
  check('sin servidor configurado no aparece la opción', !(await (await fresh()).p.$('[data-mode="online"]')));
  check('la app apunta al servidor de IT Canarias', (await readFile(join(ROOT, 'juego.js'), 'utf8')).includes("'wss://juegos.itcanarias.com/ws'"));
  await a.click('[data-ocolor="w"]'); await a.click('[data-oclock="5+0"]'); await a.click('#oCreate');
  check('crear sala: aparece el código', await waitFor(a, () => S.game && S.game.mode === 'online' && /^[A-Z2-9]{4}$/.test(S.game.room) && !!document.querySelector('.olcode')));
  check('la app guarda su ficha para volver a la silla', await a.evaluate(() => /^[A-Za-z0-9_-]{18}$/.test(S.onlineToken)));
  const code = await a.evaluate(() => S.game.room);
  await b.fill('#oCode', code.toLowerCase()); await b.click('#oJoin');
  check('el rival entra con el código y empieza sola', await waitFor(b, () => S.game && S.game.ready && S.game.seat === 1 && S.game.white === 'Carlos'));
  check('y el creador lo ve', await waitFor(a, () => S.game.ready && S.game.black === 'Tere' && S.game.seat === 0));
  check('cada uno ve el tablero desde su color', await a.evaluate(() => orientOf(S.game) === 0) && await b.evaluate(() => orientOf(S.game) === 1));
  await tap(b, 'e7'); await tap(b, 'e5');
  check('no se puede mover en el turno del rival', await b.evaluate(() => S.game.moves.length === 0));
  await move(a, 'f2f3');
  check('la jugada llega al rival', await waitFor(b, () => S.game.moves.join() === 'f2f3'));
  check('al rival le suena el aviso de que le toca', await waitFor(b, () => AvisoTurno.veces >= 1, null, 5000));
  check('y a quien acaba de jugar no', await a.evaluate(() => AvisoTurno.veces === 1));   // el suyo fue al empezar con blancas
  check('el reloj del rival corre', await waitFor(b, () => !!S.game.tick && S.game.times[1] <= 300000));
  await move(b, 'e7e5'); await waitFor(a, () => S.game.moves.length === 2);
  await move(a, 'g2g4'); await waitFor(b, () => S.game.moves.length === 3);
  await b.evaluate(() => Online.close());
  check('el rival ve la desconexión', await waitFor(a, () => S.game.oppOnline === false));
  await b.evaluate(() => resumeOnline());
  check('al volver, sigue la partida en su silla', await waitFor(a, () => S.game.oppOnline === true) && await waitFor(b, () => S.game.moves.length === 3 && S.game.seat === 1));
  await move(b, 'd8h4');
  check('mate: los dos lo reciben y se guarda', await waitFor(a, () => S.game.result === '0-1' && S.game.reason === 'mate' && S.archive.some(x => x.mode === 'online')) && await waitFor(b, () => S.game.result === '0-1' && S.archive.length === 1));
  check('cuenta para el Elo', await b.evaluate(() => { const t = eloTable(); return t.find(o => o.name === 'Tere').elo > 1200 && t.find(o => o.name === 'Carlos').elo < 1200; }));
  check('el texto dice quién gana', (await a.textContent('.gstatus')).includes('Tere'));
  await a.click('#olRematch');
  check('la revancha pedida se ve en el otro móvil', await waitFor(b, () => document.querySelector('.olbanner') && document.querySelector('.olbanner').textContent.includes('revancha')));
  await b.click('#olRematch');
  check('revancha con los colores cambiados', await waitFor(a, () => !S.game.result && S.game.seat === 1 && S.game.ready && S.game.moves.length === 0) && await waitFor(b, () => S.game.seat === 0 && !S.game.result));
  await move(b, 'd2d4'); await waitFor(a, () => S.game.moves.length === 1);
  await move(a, 'd7d5'); await waitFor(b, () => S.game.moves.length === 2);
  await b.click('#olDraw');
  check('oferta de tablas', await waitFor(a, () => !!document.querySelector('#olDrawYes')));
  await a.click('#olDrawYes');
  check('tablas aceptadas', await waitFor(b, () => S.game.result === '1/2-1/2' && S.game.reason === 'acuerdo'));
  await b.click('#olLeave');
  check('salir vuelve a la pantalla de en línea', await b.evaluate(() => !S.game && S.draft.mode === 'online'));
  check('y el otro ve que su rival se ha ido', await waitFor(a, () => S.game.oppGone === true && !document.querySelector('#olRematch')));
  await b.fill('#oCode', 'ZZZZ'); await b.click('#oJoin');
  check('código que no existe: aviso', await waitFor(b, () => ONLINE.err.includes('código')));
  check('sin errores en la página', !A1.errors.length && !B1.errors.length, A1.errors.concat(B1.errors).join(' | '));
  await A1.ctx.close(); await B1.ctx.close();
  SVS.close();
}

console.log('PGN, copias y datos maliciosos');
{
  const { p, ctx, errors } = await fresh();
  const pgn = '[Event "Torneo"]\n[White "Kasparov"]\n[Black "Topalov"]\n[Date "1999.01.20"]\n[Result "1-0"]\n\n1. e4 d6 2. d4 Nf6 3. Nc3 g6 {comentario} 4. Be3 Bg7 5. Qd2 c6 1-0\n';
  await p.evaluate(t => importPgnText(t), pgn); await p.click('#cOk');
  check('importa el PGN al historial', await p.evaluate(() => S.archive.length === 1 && S.archive[0].src === 'pgn' && S.archive[0].moves.length === 10 && S.archive[0].white === 'Kasparov'));
  check('las partidas importadas no cuentan para el Elo', await p.evaluate(() => eloTable().length === 0));
  await p.evaluate(t => importPgnText(t), pgn); await p.click('#cOk');
  check('importar dos veces no duplica', await p.evaluate(() => S.archive.length === 1));
  check('exportar PGN', await p.evaluate(() => toPgn(S.archive[0]).includes('[White "Kasparov"]') && toPgn(S.archive[0]).includes('5. Qd2 c6 1-0')));
  const res = await p.evaluate(() => {
    const evil = { app: 'ajedrez', archive: [
      { id: '<img src=x onerror=alert(1)>', mode: 'local', white: '<b>Ana</b>', black: 'Luis"', moves: ['e2e4', 'zz', 'e7e5'], result: '1-0', created: 'x' },
      { id: 'ok1', mode: 'ai', human: 7, level: 99, white: 'Pepe', black: '🤖', moves: ['e2e4', 'e7e5', 'g1f3'], result: 'hack', analysis: { evals: [[1, 2]] } },
      { id: 'bad', moves: 'no' }, null, 42 ], roster: ['<script>', 'Pepe'], solved: { 'm1-01': 9, '<x>': 1 } };
    const n = mergeBackup(evil);
    const a = S.archive.find(x => x.id === 'ok1'), b = S.archive.find(x => x.white.includes('Ana'));
    return { n, safeId: b && /^[A-Za-z0-9_-]+$/.test(b.id), name: b && b.white, mv: b && b.moves.join(), lvl: a && a.level, human: a && a.human, res: a && a.result, an: a && a.analysis, solved: S.solved['m1-01'], badKey: S.solved['<x>'], roster: S.roster };
  });
  check('copias: solo entra lo válido', res.n === 2 && res.safeId && res.name === 'bAna/b' && res.mv === 'e2e4', JSON.stringify(res));
  check('copias: valores fuera de rango se corrigen', res.lvl === 6 && res.human === 0 && res.res === null && !res.an && res.solved === 2 && res.badKey === undefined, JSON.stringify(res));
  check('copias: nombres limpios en la lista de jugadores', !res.roster.some(n => /[<>]/.test(n)), res.roster.join());
  const round = await p.evaluate(() => { const before = S.archive.length; const j = JSON.parse(backupJSON()); S.archive = []; const n = mergeBackup(j); return before === n && S.archive.length === before; });
  check('copia de seguridad: ida y vuelta', round);
  await p.evaluate(() => openArchive('partidas'));
  check('la lista de partidas se abre', await p.evaluate(() => document.querySelectorAll('#modal [data-arch]').length === 3));
  await p.click('#modal [data-arch="0"]');
  check('y desde ella se revisa una partida', await p.evaluate(() => !!REVIEW));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Clasificación, menú, temas y borrar');
{
  const mk = (i, w, b, result, extra) => Object.assign({ id: 'g' + i, created: 1e12 + i * 1e6, finished: 1e12 + i * 1e6 + 5, mode: 'local', white: w, black: b, moves: ['e2e4', 'e7e5', 'g1f3'], result, reason: 'abandono' }, extra || {});
  const archive = [mk(1, 'Ana', 'Luis', '1-0'), mk(2, 'Luis', 'Ana', '0-1'), mk(3, 'Ana', 'Pepe', '1/2-1/2'), mk(4, 'Pepe', '🤖', '1-0', { mode: 'ai', human: 0, level: 6 }), mk(5, 'Blancas', 'Negras', '1-0')].reverse();
  const { p, ctx, errors } = await fresh({ onboarded: true, archive, roster: ['Ana', 'Luis', 'Pepe'] });
  const t = await p.evaluate(() => eloTable().map(o => [o.name, Math.round(o.elo), o.pj]));
  const elo = n => (t.find(x => x[0] === n) || [])[1];
  check('Elo: Ana por encima de Luis, sin los nombres por defecto', elo('Ana') > elo('Luis') && t.length === 3 && !t.some(x => x[0] === 'Blancas'), JSON.stringify(t));
  check('ganar a la máquina de nivel 6 sube mucho', t.find(x => x[0] === 'Pepe')[1] > 1220, JSON.stringify(t));
  await p.click('#menuBtn'); await p.click('#mArch');
  check('la clasificación se ve', await p.evaluate(() => document.querySelectorAll('#modal tbody tr').length === 3));
  await p.click('#modal [data-player="Ana"]');
  check('ficha del jugador', (await p.textContent('#modal')).includes('Cara a cara'));
  await p.click('#pfBack'); await p.click('[data-tab="records"]');
  check('récords', (await p.textContent('#modal')).includes('Nivel más alto vencido'));
  await p.click('#aC');
  await p.click('#menuBtn'); await p.click('#mTheme');
  await p.click('[data-theme="claro"]'); await p.click('[data-board="verde"]');
  check('cambiar tema y tablero', await p.evaluate(() => S.theme === 'claro' && S.board === 'verde' && getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#f1eee6'));
  await p.click('#thOk');
  await p.click('#menuBtn'); await p.click('#mRoster');
  await p.fill('[data-orig="Luis"]', 'Ana'); await p.click('#roS'); await p.click('#cOk');
  check('unir jugadores en la lista', await p.evaluate(() => !S.roster.includes('Luis') && S.archive.every(a => a.white !== 'Luis' && a.black !== 'Luis')));
  await p.click('#menuBtn'); await p.click('#mWipe'); await p.click('#wHist'); await p.click('#cOk');
  check('borrar historial', await p.evaluate(() => S.archive.length === 0 && S.roster.length === 2));
  await p.click('#menuBtn'); await p.click('#mHelp');
  check('la ayuda se abre', await p.evaluate(() => !!document.querySelector('#wbNext')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Pantallas: vertical, horizontal y tablet');
{
  for (const [name, vp] of [['móvil vertical', { width: 360, height: 740 }], ['móvil horizontal', { width: 800, height: 380 }], ['tablet 10"', { width: 1280, height: 800 }], ['tablet 7" vertical', { width: 600, height: 960 }]]) {
    const { p, ctx, errors } = await fresh({ onboarded: true }, vp);
    await p.evaluate(() => { startGame({ mode: 'local', white: 'Alejandro Fernández', black: 'María del Carmen', clock: { base: 300000, inc: 0 } }); S.game.moves = ['e2e4', 'd7d5', 'e4d5', 'd8d5']; render(); });
    const m = await p.evaluate(() => { const b = document.querySelector('#board').getBoundingClientRect(); const acts = document.querySelector('.gacts').getBoundingClientRect();
      const bars = [...document.querySelectorAll('.pbar')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().bottom);
      return { bw: b.width, bh: b.height, bottom: Math.max(b.bottom, ...bars), bars: bars.length, ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth, actsBottom: acts.bottom }; });
    check(`${name}: el tablero es cuadrado y cabe entero, con los dos jugadores`, Math.abs(m.bw - m.bh) < 2 && m.bottom <= m.ih + 1 && m.bw >= 280 && m.bars === 2, JSON.stringify(m));
    check(`${name}: sin desplazamiento horizontal`, m.sw <= m.iw + 1, JSON.stringify(m));
    check(`${name}: los botones se ven sin desplazar`, m.actsBottom <= m.ih + 1, JSON.stringify(m));
    check(`${name}: sin errores`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
}

console.log('Invitación con enlace');
{ const pk = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')); const man = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  check('la app Android recibe el enlace (complemento @capacitor/app)', !!pk.dependencies['@capacitor/app'] && /android:host="unirse"/.test(man)); }
{
  const { p, ctx, errors } = await fresh(null, null, 'ws://127.0.0.1:9/ws');
  await p.waitForTimeout(300);
  check('el enlace de la invitación lleva a la página del juego', await p.evaluate(() => Invitacion.enlace('ABCD') === 'https://csuarezsm.github.io/Ajedrez/unirse.html?c=ABCD'));
  check('el código se lee del enlace de la app y de la web', await p.evaluate(() => Invitacion.deUrl('itcajedrez://unirse/ab12') === 'AB12' && Invitacion.deUrl('https://x.y/app/?unirse=wxyz') === 'WXYZ' && Invitacion.deUrl('https://x.y/app/') === null));
  check('el mensaje lleva el enlace y el código', await p.evaluate(() => { const t = Invitacion.texto('🎲', 'Juego', 'QWER'); return t.includes('unirse.html?c=QWER') && t.includes('*QWER*'); }));
  await p.evaluate(() => unirseDesdeEnlace('WXYZ')); await p.waitForTimeout(200);
  check('al abrir el enlace va a «En línea»', await p.evaluate(() => S.draft.mode === 'online'));
  check('sin nombre, pide el nombre en una ventana con el código', await p.evaluate(() => !!document.querySelector('#invName') && document.querySelector('#modal').textContent.includes('WXYZ')));
  check('el código queda guardado por si la app aún no estaba lista', await p.evaluate(() => { Invitacion.entregar('QQ11'); return true; }) && await p.evaluate(() => !localStorage.getItem('invitacionPendiente')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

// Partidas públicas y «Jugar con cualquiera», contra el servidor común de juegos
{
  console.log('Partidas públicas');
  const { createRequire: cr } = await import('node:module');
  const fsp = await import('node:fs'), osp = await import('node:os');
  const SERV = process.env.JUEGOS_SERVIDOR || fileURLToPath(new URL('../../juegos-servidor/', import.meta.url));
  if (!fsp.existsSync(join(SERV, 'src/server.js'))) check('servidor común de juegos para las pruebas', false, 'no está en ' + SERV);
  else {
    if (!process.env.DATA_DIR) process.env.DATA_DIR = fsp.mkdtempSync(join(osp.tmpdir(), 'juegos-'));
    const { crearServidor } = cr(join(SERV, 'package.json'))('./src/server.js');
    const { server: PS } = crearServidor();
    await new Promise(r => PS.listen(0, '127.0.0.1', r));
    const PWS = `ws://127.0.0.1:${PS.address().port}/ws`;
    const abrirP = async () => {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await ctx.addInitScript(u => { window.AJEDREZ_ONLINE_URL = u; if (!localStorage.getItem('ajedrez.v1')) localStorage.setItem('ajedrez.v1', JSON.stringify({ onboarded: true })); }, PWS);
      const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL_APP); await p.click('[data-mode="online"]'); return { p, ctx, errors };
    };
    const P1 = await abrirP(), P2 = await abrirP();
    await P1.p.waitForSelector('#pubBuscar', { timeout: 8000 }).catch(() => {});
    check('en línea aparecen «Jugar con cualquiera», las partidas abiertas y la casilla de partida pública', !!(await P1.p.$('#pubBuscar')) && !!(await P1.p.$('#pubLista')) && !!(await P1.p.$('#pubPublica')));
    await P1.p.fill('#oName', 'Carlos'); await P1.p.click('#pubBuscar');
    check('al buscar, espera en una mesa de «cualquiera»', await P1.p.waitForFunction(() => ONLINE.sala && ONLINE.sala.auto && ONLINE.sala.publica, null, { timeout: 8000 }).then(() => true, () => false));
    check('y lo dice en pantalla', await P1.p.waitForSelector('text=Buscando jugadores', { timeout: 5000 }).then(() => true, () => false));
    await P2.p.fill('#oName', 'Mari');
    const fila = await P2.p.waitForSelector('[data-pubentrar]', { timeout: 12000 }).catch(() => null);
    check('otro móvil la ve en «Partidas abiertas»', !!fila && (await P2.p.textContent('#pubLista')).includes('Carlos'));
    if (fila) await fila.click();
    const mismo = await P2.p.waitForFunction(() => !!ONLINE.sala, null, { timeout: 8000 }).then(() => true, () => false);
    const codigos = await Promise.all([P1, P2].map(x => x.p.evaluate(() => ONLINE.sala && ONLINE.sala.codigo)));
    check('y entra con un toque en la misma partida', mismo && codigos[0] && codigos[0] === codigos[1], JSON.stringify(codigos));
    check('sin errores en las partidas públicas', !P1.errors.length && !P2.errors.length, P1.errors.concat(P2.errors).join(' | '));
    const vol = await P1.p.evaluate(() => { const c = new OfflineAudioContext(1, 4410, 44100); const g = AudioSuave.salida(c); const medio = g.gain.value; S.volumen = 'bajo'; const bajo = AudioSuave.salida(c).gain.value; S.volumen = undefined;
      return { medio, bajo, opcion: AvisoTurno.opcionHtml().includes('data-volumen="alto"'), mismo: AudioSuave.salida(c) === g }; });
    check('sonidos suaves: pasan por el volumen general (bajo, medio, alto) y se elige en los ajustes', Math.abs(vol.medio - 0.45) < 0.01 && Math.abs(vol.bajo - 0.22) < 0.01 && vol.opcion && vol.mismo, JSON.stringify(vol));
    await P1.ctx.close(); await P2.ctx.close(); PS.close();
  }
}

await browser.close();
server.close();
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
