// Zeichnet das Tal als SVG im Bilderbuchstil: Tusche-Konturen, Aquarellflächen, Papierstruktur.
import { RIVER, RIVER_IN, RIVER_OUT } from './data.js';
import { hasNews, smokeSet } from './sim.js';

export const R = 54; // Sechseck-Radius
const S3 = Math.sqrt(3);
const INK = '#3a2c24';

export const hexToPx = (q, r) => [R * S3 * (q + r / 2), R * 1.5 * r];

function hexPoints(rad = R) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
  }
  return pts;
}
const HEX = hexPoints();
const hexPath = (rad = R) => 'M' + hexPoints(rad).map(p => p.map(n => n.toFixed(1)).join(',')).join('L') + 'Z';

// Deterministischer Zufall je Feld, damit sich die Zeichnung nicht bei jedem Bild ändert.
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s % 10000) / 10000;
  };
}

// Feste Streupunkte in einem Sechseck (nach y sortiert, damit Hinteres zuerst gezeichnet wird).
const SPOTS = new Map();
function spots(i, n, inner = 0.68) {
  const key = i + ':' + n + ':' + inner;
  if (SPOTS.has(key)) return SPOTS.get(key);
  const rnd = rng(i * 131 + n);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 2000) {
    const x = (rnd() * 2 - 1) * R * inner;
    const y = (rnd() * 2 - 1) * R * inner;
    if (Math.abs(x) > (R * S3 / 2) * inner * 1.05) continue;
    if (Math.abs(y) + Math.abs(x) / S3 > R * inner) continue;
    if (out.some(([a, b]) => (a - x) ** 2 + (b - y) ** 2 < (R * 0.22) ** 2)) continue;
    out.push([x, y, rnd()]);
  }
  out.sort((a, b) => a[1] - b[1]);
  SPOTS.set(key, out);
  return out;
}

// ---------- Defs ----------
export function defs() {
  return `
  <defs>
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 0.22 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
      <feBlend in2="SourceGraphic" mode="multiply"/>
    </filter>
    <filter id="wash" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="5" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="2" result="s"/>
      <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 0.62" result="m"/>
      <feComposite in="d" in2="m" operator="arithmetic" k1="0" k2="1" k3="-0.18" k4="0"/>
    </filter>
    <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="2.4"/>
    </filter>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="2.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="hexclip"><path d="${hexPath(R - 0.5)}"/></clipPath>
    <radialGradient id="vignette" cx="50%" cy="48%" r="62%">
      <stop offset="70%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#5b3b1f" stop-opacity=".28"/>
    </radialGradient>
    <radialGradient id="shade" cx="40%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".22"/>
      <stop offset="100%" stop-color="#3a2c24" stop-opacity=".16"/>
    </radialGradient>
  </defs>`;
}

// ---------- Bodenfarben ----------
function groundColor(t) {
  switch (t.type) {
    case 'wald': return mix('#c9b98a', '#6f9a5a', Math.min(1, t.dichte / 70));
    case 'wiese':
      if (t.acker) return mix('#a98657', '#8c6a43', 1 - t.frucht / 100);
      return t.trocken ? mix('#d9c27a', '#b9c46a', t.frucht / 100) : mix('#d6cf86', '#a9cc6e', t.frucht / 100);
    case 'fluss': return '#a8c98a';
    case 'berg': return '#b8ad98';
    case 'moor': return mix('#a39a6a', '#6f7d5a', t.magie / 100);
    case 'dorf': return '#cdbf8a';
  }
  return '#ccc';
}
function mix(a, b, f) {
  f = Math.max(0, Math.min(1, f));
  const pa = [1, 3, 5].map(k => parseInt(a.slice(k, k + 2), 16));
  const pb = [1, 3, 5].map(k => parseInt(b.slice(k, k + 2), 16));
  return '#' + pa.map((v, k) => Math.round(v + (pb[k] - v) * f).toString(16).padStart(2, '0')).join('');
}

// ---------- Motive ----------
function tree(x, y, s, kind, rnd) {
  const g = kind > 0.55 ? ['#3f6b3a', '#5e8f4c', '#86b062'] : ['#4a6f35', '#6f9645', '#9cbf5f'];
  if (kind > 0.55) {
    // Nadelbaum
    return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})">
      <rect x="-1.6" y="2" width="3.2" height="6" fill="#6b4a2f" stroke="${INK}" stroke-width=".8"/>
      <path d="M0,-16 L8,-3 L4,-3 L10,5 L-10,5 L-4,-3 L-8,-3 Z" fill="${g[0]}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M0,-14 L4,-6 L1,-6 L4,0 L-1,-2 Z" fill="${g[2]}" opacity=".55"/>
    </g>`;
  }
  const w = 8 + rnd * 2;
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})">
    <path d="M-1.5,8 L-1,0 L1,0 L1.5,8 Z" fill="#6b4a2f" stroke="${INK}" stroke-width=".8"/>
    <path d="M${-w},-2 C${-w - 2},-10 ${-4},-16 0,-15 C5,-17 ${w + 2},-10 ${w},-2 C${w + 1},4 ${-w - 1},5 ${-w},-2 Z" fill="${g[1]}" stroke="${INK}" stroke-width="1.1"/>
    <ellipse cx="-2.5" cy="-8" rx="4" ry="3" fill="${g[2]}" opacity=".6"/>
  </g>`;
}
function stump(x, y) {
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
    <path d="M-3.5,3 L-3,-1 L3,-1 L3.5,3 Z" fill="#8a6440" stroke="${INK}" stroke-width=".8"/>
    <ellipse cx="0" cy="-1" rx="3" ry="1.3" fill="#d8b98a" stroke="${INK}" stroke-width=".7"/>
  </g>`;
}
function deer(x, y) {
  return `<g transform="translate(${x},${y})" fill="#8b5a32" stroke="${INK}" stroke-width=".7" stroke-linejoin="round">
    <path d="M-6,0 C-6,-3 4,-3 5,-1 L7,-6 L8.5,-5 L7,0 L6,4 L5,4 L4.5,1 L-3,1 L-4,4 L-5,4 Z"/>
    <path d="M7,-6 L6,-9 M7.5,-6 L9,-9" fill="none"/>
  </g>`;
}
function flower(x, y, c) {
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><path d="M0,3 L0,0" stroke="#4f7a3a" stroke-width=".8"/><circle r="1.6" fill="${c}" stroke="${INK}" stroke-width=".4"/></g>`;
}
function grassTuft(x, y) {
  return `<path d="M${x - 2},${y} q1,-4 2,-5 M${x},${y} q0,-4 0,-6 M${x + 2},${y} q-1,-4 -2,-5" stroke="#5f8a3e" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
}
function sheep(x, y, flip) {
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${flip ? -1 : 1},1)">
    <path d="M-3,3 L-3,6 M2,3 L2,6" stroke="${INK}" stroke-width="1.2"/>
    <path d="M-6,0 C-7,-4 -3,-6 -1,-5 C1,-7 5,-6 5,-3 C7,-2 6,3 3,3 L-4,3 C-7,3 -7,1 -6,0 Z" fill="#fbf6ea" stroke="${INK}" stroke-width=".9"/>
    <ellipse cx="6.2" cy="-1.2" rx="2.2" ry="1.8" fill="#3a2c24"/>
  </g>`;
}
function wheat(x, y) {
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})" stroke="#9a7420" stroke-width=".8" fill="#e5b94a">
    <path d="M0,4 L0,-4"/><ellipse cx="0" cy="-5" rx="1.3" ry="2.6"/>
    <path d="M-3,4 L-2.5,-2"/><ellipse cx="-2.5" cy="-3" rx="1.1" ry="2.2"/>
    <path d="M3,4 L2.5,-2"/><ellipse cx="2.5" cy="-3" rx="1.1" ry="2.2"/>
  </g>`;
}
function house(x, y, s, roof) {
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s})">
    <path d="M-7,0 L-7,8 L7,8 L7,0 Z" fill="#f3e6c8" stroke="${INK}" stroke-width="1"/>
    <path d="M-9,1 L0,-8 L9,1 Z" fill="${roof}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <rect x="-1.8" y="3" width="3.6" height="5" fill="#7a4e2c" stroke="${INK}" stroke-width=".7"/>
    <rect x="3" y="2.5" width="2.5" height="2.5" fill="#f2c860" stroke="${INK}" stroke-width=".5"/>
    <rect x="3.5" y="-6" width="2.4" height="4" fill="#8d6a52" stroke="${INK}" stroke-width=".7"/>
  </g>`;
}
function smoke(x, y, n = 3, cls = 'smoke') {
  let s = '';
  for (let k = 0; k < n; k++) s += `<circle class="${cls}" style="animation-delay:${(k * 1.1).toFixed(1)}s" cx="${x + k * 2}" cy="${y - k * 6}" r="${2.4 + k * 1.3}" fill="#e9e4dc" stroke="#8e857c" stroke-width=".6"/>`;
  return s;
}

function edgeMid(dir) {
  // Mitte der Kante in Richtung eines Nachbarn (Pointy-Top-Sechseck).
  const [px, py] = hexToPx(dir[0], dir[1]);
  return [px / 2, py / 2];
}

// ---------- Ein Feld ----------
function drawTile(state, t, i, opts) {
  const [x, y] = hexToPx(t.q, t.r);
  const rnd = rng(i * 17 + 3);
  let body = '';
  const sp = spots(i, 12);

  if (t.type === 'wald') {
    const n = Math.round((Math.max(0, t.dichte) / 100) * sp.length);
    sp.forEach(([sx, sy, k], j) => {
      if (j < n || (j >= n && k > 0.92 && t.dichte > 0)) body += tree(sx, sy, 0.95 + k * 0.35, (k * 7) % 1, k);
      else body += stump(sx, sy + 3);
    });
    if (t.kraut > 40) for (const [sx, sy] of spots(i, 5, 0.5).slice(0, Math.round(t.kraut / 25))) body += flower(sx + 6, sy + 6, '#e6a3c9');
    if (t.wild > 50) body += deer(sp[0] ? -18 : 0, 22);
  } else if (t.type === 'wiese') {
    if (t.acker) {
      body += `<g opacity=".7" stroke="#6e4f2e" stroke-width="1.1">` + [-30, -20, -10, 0, 10, 20, 30].map(o => `<path d="M-50,${o + 5} Q0,${o - 3} 50,${o + 5}" fill="none"/>`).join('') + '</g>';
      if (t.frucht > 20) for (const [sx, sy] of spots(i, 9, 0.62)) body += wheat(sx, sy);
    } else {
      for (const [sx, sy] of spots(i, 10, 0.7)) body += grassTuft(sx, sy + 4);
      if (t.frucht > 45) for (const [sx, sy] of spots(i, 6, 0.55).slice(0, Math.round(t.frucht / 20))) body += flower(sx - 4, sy - 5, t.trocken ? '#e0b64a' : '#f6e27a');
      const ns = Math.round((t.schafe / 100) * 3);
      spots(i, 4, 0.45).slice(0, ns).forEach(([sx, sy, k]) => (body += sheep(sx, sy, k > 0.5)));
    }
    if (t.nass > 0) body += `<ellipse cx="-10" cy="12" rx="${6 + t.nass / 4}" ry="${3 + t.nass / 10}" fill="#7fa6a2" opacity=".55" stroke="${INK}" stroke-width=".5"/>`;
  } else if (t.type === 'fluss') {
    const k = RIVER.findIndex(([q, r]) => q === t.q && r === t.r);
    const prev = k > 0 ? RIVER[k - 1] : RIVER_IN;
    const next = k < RIVER.length - 1 ? RIVER[k + 1] : RIVER_OUT;
    const [ax, ay] = edgeMid([prev[0] - t.q, prev[1] - t.r]);
    const [bx, by] = edgeMid([next[0] - t.q, next[1] - t.r]);
    const d = `M${ax.toFixed(1)},${ay.toFixed(1)} Q${(rnd() * 10 - 5).toFixed(1)},${(rnd() * 6 - 3).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
    const wide = 22;
    body += `<path d="${d}" stroke="${INK}" stroke-width="${wide + 2.4}" fill="none" stroke-linecap="butt"/>`;
    body += `<path d="${d}" stroke="#5d93b8" stroke-width="${wide}" fill="none"/>`;
    body += `<path d="${d}" stroke="#9cc6de" stroke-width="${wide * 0.45}" fill="none" stroke-dasharray="7 9" opacity=".8"/>`;
    for (const [sx, sy] of spots(i, 6, 0.75)) if (Math.hypot(sx, sy) > 22) body += grassTuft(sx, sy);
    const nf = Math.round(t.fisch / 34);
    for (let f = 0; f < nf; f++) {
      const fx = ax + (bx - ax) * (0.3 + f * 0.2), fy = ay + (by - ay) * (0.3 + f * 0.2);
      body += `<path class="fish" style="animation-delay:${f * 0.7}s" d="M${(fx - 4).toFixed(1)},${fy.toFixed(1)} q4,-3 7,0 q-3,3 -7,0 l-2,-2 l0,4 z" fill="#e8eef0" stroke="${INK}" stroke-width=".6"/>`;
    }
  } else if (t.type === 'berg') {
    const peaks = [[-18, 10, 26], [14, 12, 22], [-2, 2, 34]];
    for (const [px, py, h] of peaks) {
      body += `<path d="M${px - h * 0.8},${py + 12} L${px},${py - h + 8} L${px + h * 0.8},${py + 12} Z" fill="#9a9488" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`;
      body += `<path d="M${px},${py - h + 8} L${px + h * 0.8},${py + 12} L${px + 2},${py + 12} Z" fill="#7a7468" opacity=".7"/>`;
      body += `<path d="M${px - h * 0.27},${py - h * 0.66 + 8} L${px},${py - h + 8} L${px + h * 0.27},${py - h * 0.66 + 8} L${px + 3},${py - h * 0.55 + 8} L${px - 2},${py - h * 0.62 + 8} Z" fill="#fbfaf5" stroke="${INK}" stroke-width=".8"/>`;
    }
    if (t.tiefe > 0) {
      const s = 1 + Math.min(1, t.tiefe / 60) * 0.5;
      body += `<g transform="translate(-2,22) scale(${s})"><path d="M-8,6 L-8,-2 Q0,-10 8,-2 L8,6 Z" fill="#2a211c" stroke="${INK}" stroke-width="1.1"/><path d="M-9,6 L-9,-3 M9,6 L9,-3 M-10,-3 Q0,-12 10,-3" stroke="#7a5432" stroke-width="2" fill="none"/></g>`;
      if (t.tiefe > 60) body += `<circle cx="-5" cy="24" r="1.2" fill="#ff7a3a" class="eyes"/><circle cx="1" cy="24" r="1.2" fill="#ff7a3a" class="eyes"/>`;
    }
    if (t.gesperrt > 0) {
      for (const [sx, sy] of spots(i, 7, 0.32)) body += `<circle cx="${sx - 2}" cy="${sy + 22}" r="${3 + (sx % 2)}" fill="#8f8577" stroke="${INK}" stroke-width=".8"/>`;
    }
  } else if (t.type === 'moor') {
    for (const [sx, sy, k] of spots(i, 5, 0.6)) body += `<ellipse cx="${sx}" cy="${sy}" rx="${7 + k * 5}" ry="${3 + k * 2}" fill="#4f6d68" stroke="${INK}" stroke-width=".8" opacity="${1 - t.trocken / 140}"/>`;
    for (const [sx, sy] of spots(i, 8, 0.72)) body += `<path d="M${sx},${sy + 4} l-1,-9 M${sx + 2},${sy + 4} l1,-7 M${sx - 2},${sy + 4} l-3,-6" stroke="#5a5a2e" stroke-width="1" fill="none"/><ellipse cx="${sx - 1}" cy="${sy - 5}" rx="1" ry="2.4" fill="#6d4a2c"/>`;
    const nl = Math.round((t.magie / 100) * 4);
    spots(i, 4, 0.5).slice(0, nl).forEach(([sx, sy], k) => (body += `<circle class="wisp" style="animation-delay:${k * 0.9}s" cx="${sx}" cy="${sy - 10}" r="3" fill="#dfffa8" filter="url(#glow)"/>`));
    if (t.trocken > 0) body += `<g opacity="${t.trocken / 100}" stroke="#6e4f2e" stroke-width="1.6"><path d="M-40,-8 L40,-8 M-40,12 L40,12" fill="none" stroke-dasharray="6 3"/></g>`;
  } else if (t.type === 'dorf') {
    const roofs = ['#b65a3c', '#a2492f', '#c27a3a', '#8e4a3a'];
    const pos = [[-14, -16], [12, -18], [-24, 4], [0, -2], [22, 2], [-10, 18], [14, 20], [-28, -14], [28, -12], [0, 28], [-26, 24], [27, 24]];
    const n = Math.min(pos.length, state.village.pop);
    const placed = pos.slice(0, n).sort((a, b) => a[1] - b[1]);
    for (const [hx, hy] of placed) body += house(hx, hy, 0.95, roofs[Math.abs(hx + hy) % 4]);
    body += smoke(-11, -27, 2, 'smoke slow');
    if (state.res.nahrung <= 0) body += `<text x="0" y="40" text-anchor="middle" class="hunger">Hunger</text>`;
  }

  // Bauwerke
  const b = t.building;
  if (b) body += drawBuilding(b, t);
  // Rauch von Meiler-Nachbarn
  if (opts.smoke.has(i)) body += `<circle cx="0" cy="-8" r="${R * 0.7}" fill="#8a8178" opacity=".18"/>`;

  // Feld zusammensetzen
  const sel = opts.highlight;
  let cls = 'tile';
  if (sel) cls += sel.has(i) ? ' valid' : ' dim';
  if (opts.selected === i) cls += ' selected';
  let g = `<g class="${cls}" data-i="${i}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">`;
  g += `<g clip-path="url(#hexclip)"><g filter="url(#wash)"><path d="${hexPath(R + 4)}" fill="${groundColor(t)}"/></g><path d="${hexPath(R)}" fill="url(#shade)"/>${body}</g>`;
  g += `<path class="edge" d="${hexPath(R - 0.5)}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" filter="url(#rough)"/>`;
  if (t.tool) g += drawToolBadge(t.tool);
  if (opts.news && hasNews(t)) g += `<g class="news" transform="translate(${R * 0.55},${-R * 0.62})"><circle r="8" fill="#b23a2a" stroke="${INK}" stroke-width="1.2"/><circle r="5.3" fill="none" stroke="#e8a090" stroke-width=".8"/><text y="3.6" text-anchor="middle" font-size="10" font-weight="700" fill="#fff6e8">!</text></g>`;
  g += `<path class="hit" d="${hexPath(R)}" fill="transparent"/>`;
  g += '</g>';
  return g;
}

function drawBuilding(b, t) {
  if (b.id === 'meiler') {
    return `<g transform="translate(0,6)">
      <path d="M-18,10 Q-18,-12 0,-14 Q18,-12 18,10 Z" fill="#5a4030" stroke="${INK}" stroke-width="1.3"/>
      <path d="M-12,4 Q0,-6 12,4 M-15,9 Q0,-1 15,9 M-8,-3 Q0,-9 8,-3" stroke="#3a2a20" stroke-width=".9" fill="none"/>
      ${b.cold ? '' : '<path d="M-3,-13 Q0,-17 3,-13" fill="#e57a35" stroke="' + INK + '" stroke-width=".6"/>' + smoke(-1, -20, 4)}
    </g>`;
  }
  if (b.id === 'brunnen') {
    return `<g transform="translate(0,4)">
      <path d="M-12,-14 L0,-24 L12,-14 Z" fill="#a2492f" stroke="${INK}" stroke-width="1.1"/>
      <path d="M-10,-14 L-10,4 M10,-14 L10,4" stroke="#6b4a2f" stroke-width="2.2"/>
      <path d="M-10,-6 L10,-6" stroke="#6b4a2f" stroke-width="1"/><path d="M0,-6 L0,0" stroke="${INK}" stroke-width=".6"/>
      <ellipse cx="0" cy="6" rx="13" ry="5" fill="#9aa1a5" stroke="${INK}" stroke-width="1.1"/>
      <path d="M-13,6 L-13,12 Q0,18 13,12 L13,6" fill="#b5aea0" stroke="${INK}" stroke-width="1.1"/>
      <ellipse cx="0" cy="6" rx="9" ry="3" fill="#4f7d99"/>
    </g>`;
  }
  if (b.id === 'muehle') {
    return `<g>
      <path d="M-30,10 L30,-4 L30,4 L-30,18 Z" fill="#8a6440" stroke="${INK}" stroke-width="1.1"/>
      <g transform="translate(-14,-8)">
        <rect x="-11" y="-6" width="22" height="18" fill="#f1e2c0" stroke="${INK}" stroke-width="1"/>
        <path d="M-14,-5 L0,-18 L14,-5 Z" fill="#6f4a36" stroke="${INK}" stroke-width="1.1"/>
        <rect x="-3" y="4" width="6" height="8" fill="#7a4e2c" stroke="${INK}" stroke-width=".6"/>
      </g>
      <g class="wheel" transform="translate(8,-2)">
        <circle r="11" fill="none" stroke="#6b4a2f" stroke-width="2.6"/>
        <path d="M-11,0 L11,0 M0,-11 L0,11 M-8,-8 L8,8 M-8,8 L8,-8" stroke="#6b4a2f" stroke-width="1.4"/>
        <circle r="11" fill="none" stroke="${INK}" stroke-width=".7"/>
      </g>
    </g>`;
  }
  return '';
}

// ---------- Werkzeug-Abzeichen ----------
export function toolIcon(id, size = 22) {
  const p = {
    axt: `<path d="M5,21 L15,6" stroke="#6b4a2f" stroke-width="2.6" stroke-linecap="round"/><path d="M12,3 C17,2 21,6 20,11 L14,9 Z" fill="#a9b4ba" stroke="${INK}" stroke-width="1"/>`,
    feenaxt: `<path d="M5,21 L15,6" stroke="#c9b27a" stroke-width="2.6" stroke-linecap="round"/><path d="M12,3 C17,2 21,6 20,11 L14,9 Z" fill="#d6f3ff" stroke="${INK}" stroke-width="1"/><circle cx="19" cy="4" r="1.5" fill="#f7e27a"/>`,
    pflug: `<path d="M3,6 L13,14" stroke="#6b4a2f" stroke-width="2.4" stroke-linecap="round"/><path d="M11,12 L20,13 L17,19 L10,17 Z" fill="#a9b4ba" stroke="${INK}" stroke-width="1"/><path d="M3,6 L6,3" stroke="#6b4a2f" stroke-width="2"/>`,
    spitzhacke: `<path d="M12,8 L12,22" stroke="#6b4a2f" stroke-width="2.6" stroke-linecap="round"/><path d="M2,9 Q12,1 22,9 Q12,5 2,9 Z" fill="#a9b4ba" stroke="${INK}" stroke-width="1"/>`,
    sense: `<path d="M6,22 L14,4" stroke="#6b4a2f" stroke-width="2.4" stroke-linecap="round"/><path d="M14,4 Q22,4 22,12 Q19,7 13,7 Z" fill="#a9b4ba" stroke="${INK}" stroke-width="1"/>`,
    angel: `<path d="M4,21 L17,3" stroke="#6b4a2f" stroke-width="2" stroke-linecap="round"/><path d="M17,3 Q21,10 19,17" stroke="${INK}" stroke-width=".8" fill="none"/><circle cx="19" cy="18" r="1.8" fill="#d33" stroke="${INK}" stroke-width=".6"/>`,
    spaten: `<path d="M12,2 L12,14" stroke="#6b4a2f" stroke-width="2.4" stroke-linecap="round"/><path d="M9,2 L15,2" stroke="#6b4a2f" stroke-width="2"/><path d="M7,13 L17,13 L16,21 Q12,23 8,21 Z" fill="#a9b4ba" stroke="${INK}" stroke-width="1"/>`,
    meiler: `<path d="M3,20 Q3,7 12,6 Q21,7 21,20 Z" fill="#5a4030" stroke="${INK}" stroke-width="1"/><circle cx="12" cy="3" r="2" fill="#ddd" stroke="#888" stroke-width=".5"/>`,
    brunnen: `<path d="M5,9 L12,3 L19,9 Z" fill="#a2492f" stroke="${INK}" stroke-width="1"/><ellipse cx="12" cy="16" rx="8" ry="3" fill="#9aa1a5" stroke="${INK}" stroke-width="1"/><path d="M4,16 L4,20 Q12,24 20,20 L20,16" fill="#b5aea0" stroke="${INK}" stroke-width="1"/>`,
    muehle: `<circle cx="12" cy="12" r="8" fill="none" stroke="#6b4a2f" stroke-width="2.2"/><path d="M4,12 L20,12 M12,4 L12,20 M6,6 L18,18 M6,18 L18,6" stroke="#6b4a2f" stroke-width="1.2"/>`,
    glut2: `<path d="M12,3 C16,8 19,11 17,17 C15,21 9,21 7,17 C5,12 9,10 12,3 Z" fill="#e8823a" stroke="${INK}" stroke-width="1"/><path d="M12,10 C14,13 14,16 12,18 C10,16 10,13 12,10 Z" fill="#ffd25a"/>`,
    glut3: `<path d="M12,3 C16,8 19,11 17,17 C15,21 9,21 7,17 C5,12 9,10 12,3 Z" fill="#7ab8ff" stroke="${INK}" stroke-width="1"/><path d="M12,10 C14,13 14,16 12,18 C10,16 10,13 12,10 Z" fill="#e6f7ff"/>`,
  }[id] || '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${p}</svg>`;
}

function drawToolBadge(tool) {
  const f = Math.max(0, tool.dur / tool.maxDur);
  const r = 12;
  const c = 2 * Math.PI * r;
  return `<g class="badge${tool.active ? '' : ' idle'}" transform="translate(${-R * 0.5},${R * 0.5})">
    <circle r="${r + 1}" fill="#f6ecd2" stroke="${INK}" stroke-width="1.3"/>
    <circle r="${r - 1.5}" fill="none" stroke="#d9c79c" stroke-width="2.5"/>
    <circle r="${r - 1.5}" fill="none" stroke="#7f9b4a" stroke-width="2.5" stroke-dasharray="${(c * f * ((r - 1.5) / r)).toFixed(1)} 999" transform="rotate(-90)"/>
    <g transform="translate(-8,-8)">${toolIcon(tool.id, 16).replace('<svg', '<svg x="0" y="0"')}</g>
  </g>`;
}

// ---------- Ganze Karte ----------
export function drawMap(state, opts = {}) {
  const tiles = opts.tiles || state.tiles;
  const view = { ...state, tiles };
  const o = { highlight: opts.highlight || null, selected: opts.selected ?? -1, news: opts.news !== false, smoke: smokeSet(view) };
  const night = opts.night || 0;
  const W = R * S3 * 5 + 40, H = R * 8 + 40;
  let s = `<svg class="map" viewBox="${-W / 2} ${-H / 2} ${W} ${H}" role="img" aria-label="Karte des Tals">${defs()}`;
  s += `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="#efe2c2" filter="url(#paper)"/>`;
  // Kartenrand: Nebel mit Unentdecktem (noch verschlossen)
  s += `<g opacity=".55">${ring3()}</g>`;
  tiles.forEach((t, i) => (s += drawTile(view, t, i, o)));
  if (night > 0) s += `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="#1d2550" opacity="${(night * 0.32).toFixed(2)}" pointer-events="none" style="mix-blend-mode:multiply"/>`;
  s += `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="url(#vignette)" pointer-events="none"/>`;
  s += '</svg>';
  return s;
}

function ring3() {
  // Ein Ring aus angedeuteten, noch unentdeckten Feldern um das Tal.
  let s = '';
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  let q = -3, r = 3;
  for (let side = 0; side < 6; side++) {
    for (let k = 0; k < 3; k++) {
      const [x, y] = hexToPx(q, r);
      s += `<path transform="translate(${x.toFixed(1)},${y.toFixed(1)})" d="${hexPath(R - 1)}" fill="#e3d4b0" stroke="#b8a37c" stroke-width="1" stroke-dasharray="4 4"/>`;
      q += dirs[side][0];
      r += dirs[side][1];
    }
  }
  return s;
}
