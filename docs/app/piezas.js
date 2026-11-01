/* Ajedrez — piezas dibujadas para esta app (IT Canarias). © 2026 IT Canarias. Todos los derechos reservados. */
(function (root) {
'use strict';
// Siluetas en un lienzo de 100×100. Cada pieza: forma principal y detalles.
const BASE = '<rect x="22" y="80" width="56" height="10" rx="4"/>';
const SHAPES = {
  1: '<circle cx="50" cy="29" r="12"/><path d="M37 79C38 64 42 54 45 47H55C58 54 62 64 63 79Z"/><rect x="36" y="43" width="28" height="7" rx="3.5"/><rect x="26" y="77" width="48" height="11" rx="4"/>',
  2: '<path d="M29 80C29 70 33 63 40 56C45 51 47 47 46 43L37 47C31 50 25 48 24 43C23 39 26 36 30 32L39 23C42 18 45 13 47 10L51 17C60 18 69 25 73 36C77 48 76 64 73 80Z"/>' + BASE,
  3: '<circle cx="50" cy="13" r="5"/><path d="M50 19C39 28 33 38 35 48C36 53 40 56 43 57H57C60 56 64 53 65 48C67 38 61 28 50 19Z"/><rect x="38" y="56" width="24" height="6" rx="3"/><path d="M40 62H60C61 68 63 74 66 80H34C37 74 39 68 40 62Z"/>' + BASE,
  4: '<path d="M28 16H38V24H45V16H55V24H62V16H72V36L66 40H34L28 36Z"/><path d="M35 40H65L68 78H32Z"/><rect x="29" y="74" width="42" height="7" rx="2"/>' + BASE,
  5: '<path d="M30 72L22 30L36 49L41 23L50 45L59 23L64 49L78 30L70 72Z"/><circle cx="22" cy="27" r="5"/><circle cx="41" cy="20" r="5"/><circle cx="59" cy="20" r="5"/><circle cx="78" cy="27" r="5"/><path d="M30 70H70L72 80H28Z"/>' + BASE,
  6: '<rect x="46.5" y="6" width="7" height="22" rx="1.5"/><rect x="40" y="11.5" width="20" height="7" rx="1.5"/><path d="M50 32C46 27 38 26 32 29C24 33 22 42 25 51C27 58 30 64 32 72H68C70 64 73 58 75 51C78 42 76 33 68 29C62 26 54 27 50 32Z"/><path d="M31 70H69L71 80H29Z"/>' + BASE,
};
// Líneas de detalle (en negro sobre las blancas y en claro sobre las negras)
const DETAILS = {
  1: '',
  2: '<circle cx="44" cy="27" r="2.6" class="dot"/><path d="M57 21C64 28 67 40 66 52" class="ln"/><path d="M32 41L28 44" class="ln"/>',
  3: '<path d="M55 30L45 42" class="ln"/><path d="M45 34H55" class="ln" style="display:none"/>',
  4: '<path d="M34 40H66" class="ln"/><path d="M33 72H67" class="ln"/>',
  5: '<path d="M30 70H70" class="ln"/><circle cx="50" cy="60" r="3" class="dot"/>',
  6: '<path d="M50 34V68" class="ln"/><path d="M31 70H69" class="ln"/>',
};
const COLORS = [
  { fill: '#f7f2e6', stroke: '#1e1e1e', detail: '#1e1e1e' },
  { fill: '#2c2c2e', stroke: '#0e0e0e', detail: '#e9e4d8' },
];
function pieceSvg(type, color) {
  const c = COLORS[color];
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="${c.fill}" stroke="${c.stroke}" stroke-width="3.2" stroke-linejoin="round">${SHAPES[type]}</g>` +
    `<g fill="none" stroke="${c.detail}" stroke-width="2.6" stroke-linecap="round">${DETAILS[type].replace(/class="dot"/g, `fill="${c.detail}" stroke="none"`).replace(/class="ln"/g, '')}</g></svg>`;
}
const CACHE = {};
const piece = (type, color) => CACHE[type * 2 + color] || (CACHE[type * 2 + color] = pieceSvg(type, color));
root.Piezas = { piece };
if (typeof module !== 'undefined' && module.exports) module.exports = root.Piezas;
})(typeof self !== 'undefined' ? self : globalThis);
