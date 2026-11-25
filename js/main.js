// Oberfläche, Spielschleife, Speichern.
import { RES, TOOLS, BUILDINGS, RECIPES, GLUT, K, itemName } from './data.js';
import {
  newGame, advance, catchUp, place, canPlace, returnTool, startCraft, recipeStatus, tileLabel, hasNews,
  handsUsed, handsFree, esseSpeed, clockText, serialize, deserialize, exportCode, importCode,
} from './sim.js';
import { drawMap, toolIcon } from './render.js';

const SAVE_KEY = 'fantasyforge.save.v1';
const $ = sel => document.querySelector(sel);

let state;
let ui = { selectedItem: null, selectedTile: -1, sheet: null, before: null, showBefore: false, lastEvent: 0 };

// ---------- Laden / Speichern ----------
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return deserialize(raw);
  } catch (e) { console.warn('Spielstand nicht lesbar', e); }
  return newGame({ startHour: new Date().getHours() + new Date().getMinutes() / 60 });
}
function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch (e) { /* privater Modus o. Ä. */ }
}

// ---------- Abwesenheit: Vorher-Nachher ----------
function snapshot() { return JSON.parse(JSON.stringify(state.tiles)); }

function timeJump(hours, label) {
  const before = snapshot();
  const resBefore = { ...state.res, pop: state.village.pop };
  advance(state, hours);
  showChanges(before, resBefore, label);
  save();
  render();
}

function showChanges(before, resBefore, label) {
  const changed = state.tiles.some((t, i) => tileLabel(t) !== tileLabel(before[i]) || hasNews(t));
  if (!changed) return;
  ui.before = { tiles: before, res: resBefore, label };
  ui.showBefore = false;
}

// ---------- Rendern ----------
function render() {
  const c = clockText(state);
  const night = c.hour < 5 || c.hour >= 22 ? 1 : c.hour < 7 ? (7 - c.hour) / 2 : c.hour >= 20 ? (c.hour - 20) / 2 : 0;
  $('#clock').textContent = `Tag ${c.day} · ${c.hh}:${c.mm}`;
  $('#glut').textContent = GLUT[state.esse.level].name;

  // Ressourcen
  $('#res').innerHTML = Object.entries(RES)
    .filter(([k]) => state.res[k] >= 0.05 || ['holz', 'erz', 'stein', 'nahrung'].includes(k))
    .map(([k, name]) => `<span class="chip res-${k}${k === 'nahrung' && state.res.nahrung <= 0 ? ' warn' : ''}"><i></i>${name} <b>${fmtRes(state.res[k])}</b></span>`)
    .join('') + `<span class="chip hands"><i></i>Hände <b>${handsFree(state)}/${state.village.pop}</b> frei</span>`;

  // Karte
  let highlight = null;
  if (ui.selectedItem != null) {
    highlight = new Set();
    state.tiles.forEach((t, i) => { if (!canPlace(state, ui.selectedItem, i)) highlight.add(i); });
  }
  const beforeMode = ui.before && ui.showBefore;
  $('#map').innerHTML = drawMap(state, {
    tiles: beforeMode ? ui.before.tiles : state.tiles,
    highlight, selected: ui.selectedTile, news: !beforeMode, night,
  });
  $('#map').classList.toggle('before', !!beforeMode);

  // Vorher-Nachher-Leiste
  const bar = $('#compare');
  if (ui.before) {
    bar.hidden = false;
    bar.innerHTML = `<span>${ui.before.label}</span>
      <div class="seg"><button data-act="cmp-before" class="${ui.showBefore ? 'on' : ''}">Vorher</button><button data-act="cmp-after" class="${ui.showBefore ? '' : 'on'}">Nachher</button></div>
      <button data-act="cmp-close" class="link">Fertig</button>`;
  } else bar.hidden = true;

  // Hinweis bei Auswahl
  const hint = $('#hint');
  if (ui.selectedItem != null) {
    const it = state.inventory.find(x => x.uid === ui.selectedItem);
    hint.hidden = false;
    hint.innerHTML = `<span>${it ? itemName(it.id) : ''}: Tippe auf ein leuchtendes Feld.</span><button data-act="cancel" class="link">Abbrechen</button>`;
  } else hint.hidden = true;

  // Esse
  const job = state.esse.job;
  const es = $('#esse');
  if (job) {
    const left = job.left / esseSpeed(state);
    const done = clockText(state, left);
    const pct = 100 * (1 - job.left / job.total);
    es.innerHTML = `<div class="forge-row">${toolIcon(job.id, 30)}<div class="grow"><div><b>${recipeName(job.id)}</b> in der Esse</div>
      <div class="bar"><div style="width:${pct.toFixed(1)}%"></div></div>
      <small>fertig ${done.day !== clockText(state).day ? 'morgen ' : ''}um ${done.hh}:${done.mm} · noch ${fmtDur(left)}</small></div></div>`;
  } else {
    es.innerHTML = `<div class="forge-row"><div class="ember"></div><div class="grow"><b>Die Esse ist frei.</b><br><small>Leg etwas hinein: Kurzes für tagsüber, Langes für die Nacht.</small></div>
      <button class="btn" data-act="open-forge">Schmieden</button></div>`;
  }

  // Ablage
  const inv = $('#inv');
  if (!state.inventory.length) inv.innerHTML = '<p class="empty">Noch nichts Fertiges. Die Esse wartet.</p>';
  else inv.innerHTML = state.inventory.map(it => {
    const def = TOOLS[it.id] || BUILDINGS[it.id];
    const dur = TOOLS[it.id] ? `<small>${Math.ceil(it.dur)} Std. Arbeit</small>` : '<small>Bauwerk</small>';
    return `<button class="item${ui.selectedItem === it.uid ? ' on' : ''}" data-act="pick" data-uid="${it.uid}">${toolIcon(it.id, 30)}<span>${def.name}${dur}</span></button>`;
  }).join('');

  renderSheet();
}

function renderSheet() {
  const sh = $('#sheet');
  if (!ui.sheet) { sh.hidden = true; $('#scrim').hidden = true; return; }
  sh.hidden = false; $('#scrim').hidden = false;
  if (ui.sheet === 'forge') {
    sh.innerHTML = `<header><h2>Esse · ${GLUT[state.esse.level].name}</h2><button class="x" data-act="close">✕</button></header>
      <p class="sub">Tempo ×${esseSpeed(state).toLocaleString('de-DE')}${state.tiles.some(t => t.building && t.building.id === 'muehle') ? ' (Hammerwerk der Mühle)' : ''}. Ein Platz – was du hineinlegst, blockiert ihn bis es fertig ist.</p>
      <div class="recipes">${RECIPES.filter(r => !(r.kind === 'upgrade' && state.esse.level >= r.to)).map(recipeCard).join('')}</div>`;
  } else if (ui.sheet === 'tile') {
    const t = state.tiles[ui.selectedTile];
    const notes = [...t.notes].reverse();
    let actions = '';
    if (t.tool) actions += `<button class="btn ghost" data-act="retrieve">${itemName(t.tool.id)} zurückholen</button>`;
    sh.innerHTML = `<header><h2>${tileLabel(t)}</h2><button class="x" data-act="close">✕</button></header>
      ${tileFacts(t)}
      <h3>Was hier geschah</h3>
      ${notes.length ? '<ul class="notes">' + notes.map(n => `<li class="${n.h > t.seen ? 'new' : ''}"><small>${ago(n.h)}</small>${n.text}</li>`).join('') + '</ul>' : '<p class="empty">Bisher ist hier nichts geschehen.</p>'}
      <div class="actions">${actions}</div>`;
  } else if (ui.sheet === 'menu') {
    sh.innerHTML = `<header><h2>Werkbank</h2><button class="x" data-act="close">✕</button></header>
      <h3>Zeitraffer (zum Testen)</h3>
      <div class="row"><button class="btn ghost" data-act="ff" data-h="1">+1 Std.</button><button class="btn ghost" data-act="ff" data-h="8">+8 Std.</button><button class="btn ghost" data-act="ff" data-h="24">+1 Tag</button></div>
      <h3>Spielstand</h3>
      <div class="row"><button class="btn ghost" data-act="export">Exportieren</button><button class="btn ghost" data-act="import">Importieren</button></div>
      <textarea id="code" rows="3" placeholder="Code zum Importieren hier einfügen …"></textarea>
      <div class="row"><button class="btn danger" data-act="reset">Neues Tal beginnen</button></div>
      <p class="sub">Nach Abwesenheit werden höchstens ${K.maxCatchUp} Stunden nachgerechnet. Version ${window.APP_VERSION || ''}</p>`;
  }
}

function recipeName(id) {
  const r = RECIPES.find(x => x.id === id);
  return r && r.name ? r.name : itemName(id);
}

function recipeCard(r) {
  const err = recipeStatus(state, r);
  const def = TOOLS[r.id] || BUILDINGS[r.id];
  const gives = r.gives || def.gives;
  const takes = def ? def.takes : '';
  const cost = Object.entries(r.cost).map(([k, n]) => `<span class="${(state.res[k] || 0) + 1e-9 < n ? 'miss' : ''}">${n} ${RES[k]}</span>`).join(' · ');
  const hrs = r.hours / esseSpeed(state);
  return `<div class="recipe${err ? ' off' : ''}">
    <div class="rhead">${toolIcon(r.id, 34)}<div class="grow"><b>${recipeName(r.id)}</b><small>${cost} · ${fmtDur(hrs)}${def && TOOLS[r.id] ? ' · hält ' + TOOLS[r.id].dur + ' Std.' : ''}</small></div>
    <button class="btn small" data-act="craft" data-id="${r.id}" ${err ? 'disabled' : ''}>${err && err.startsWith('Braucht') ? '🔒' : 'Los'}</button></div>
    <div class="trade"><span class="plus">＋ ${gives}</span>${takes ? `<span class="minus">－ ${takes}</span>` : ''}</div>
    ${err && err !== 'Zu wenig Rohstoffe.' && err !== 'Die Esse ist belegt.' ? `<small class="why">${err}</small>` : ''}
  </div>`;
}

function tileFacts(t) {
  const f = [];
  const bar = (name, v, good = true) => `<div class="fact"><span>${name}</span><div class="meter${good ? '' : ' bad'}"><div style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%"></div></div></div>`;
  if (t.type === 'wald') f.push(bar('Bäume', t.dichte), bar('Wild', t.wild), bar('Kräuter', t.kraut));
  if (t.type === 'wiese') { f.push(bar('Fruchtbarkeit', t.frucht)); if (!t.acker) f.push(bar('Schafe', t.schafe)); if (t.nass > 0) f.push(bar('Staunässe', (t.nass / K.dammNass) * 100, false)); }
  if (t.type === 'fluss') f.push(bar('Fisch', t.fisch));
  if (t.type === 'berg') { f.push(bar('Tiefe', Math.min(100, t.tiefe), false)); if (t.gesperrt > 0) f.push(`<p class="sub">Gesperrt, noch ${fmtDur(t.gesperrt)}.</p>`); }
  if (t.type === 'moor') { f.push(bar('Irrlichter', t.magie), bar('Moorkraut', t.kraut)); if (t.trocken > 0) f.push(bar('Trockengelegt', t.trocken, false)); }
  if (t.type === 'dorf') {
    const v = state.village;
    f.push(`<p class="sub">${v.pop} Bewohner, ${handsUsed(state)} davon arbeiten. Isst ${(K.eat * v.pop).toLocaleString('de-DE', { maximumFractionDigits: 2 })} Nahrung pro Stunde.</p>`);
    f.push(bar('Bis zum nächsten Zuzug', (v.growth / K.growNeed) * 100));
  }
  if (t.tool) f.push(`<p class="sub">${toolIcon(t.tool.id, 18)} ${itemName(t.tool.id)} arbeitet hier${t.tool.active ? '' : ' nicht – keine freie Hand'}, noch ${fmtDur(t.tool.dur)}.</p>`);
  if (t.building) f.push(`<p class="sub">${toolIcon(t.building.id, 18)} ${itemName(t.building.id)}${t.building.cold ? ' (erkaltet)' : ''}${t.building.active === false ? ' – keine freie Hand' : ''}.</p>`);
  return '<div class="facts">' + f.join('') + '</div>';
}

// ---------- Formatierung ----------
function fmtRes(v) { return v < 10 ? (Math.floor(v * 10) / 10).toLocaleString('de-DE') : Math.floor(v).toString(); }
function fmtDur(h) {
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' Min.';
  if (h < 24) return (Math.round(h * 10) / 10).toLocaleString('de-DE') + ' Std.';
  return (Math.round((h / 24) * 10) / 10).toLocaleString('de-DE') + ' Tage';
}
function ago(h) {
  const d = state.simHours - h;
  if (d < 0.1) return 'gerade eben';
  if (d < 1) return 'vor ' + Math.round(d * 60) + ' Min.';
  if (d < 24) return 'vor ' + Math.round(d) + ' Std.';
  return 'vor ' + Math.round(d / 24) + ' Tag' + (Math.round(d / 24) > 1 ? 'en' : '');
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3800);
}
function flushEvents() {
  const ev = state.events.splice(0);
  if (ev.length <= 2) ev.forEach(e => toast(e.text));
  else toast(`${ev[ev.length - 1].text} – und ${ev.length - 1} weitere Ereignisse. Die Markierungen auf der Karte zeigen, wo.`);
}

// ---------- Eingaben ----------
document.addEventListener('click', e => {
  const tileEl = e.target.closest('.tile');
  const btn = e.target.closest('[data-act]');
  if (tileEl && !btn) return onTile(+tileEl.dataset.i);
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'pick') {
    const uid = +btn.dataset.uid;
    ui.selectedItem = ui.selectedItem === uid ? null : uid;
    if (ui.before) ui.before = null;
  } else if (act === 'cancel') ui.selectedItem = null;
  else if (act === 'open-forge') ui.sheet = 'forge';
  else if (act === 'menu') ui.sheet = 'menu';
  else if (act === 'close') { ui.sheet = null; ui.selectedTile = -1; }
  else if (act === 'craft') {
    const err = startCraft(state, btn.dataset.id);
    if (err) toast(err); else { ui.sheet = null; save(); }
  } else if (act === 'retrieve') {
    returnTool(state, ui.selectedTile);
    toast('Zurück in der Ablage.');
    ui.sheet = null; ui.selectedTile = -1; save();
  } else if (act === 'ff') {
    ui.sheet = null;
    const h = +btn.dataset.h;
    timeJump(h, `Zeitraffer: +${h} Std.`);
  } else if (act === 'cmp-before') ui.showBefore = true;
  else if (act === 'cmp-after') ui.showBefore = false;
  else if (act === 'cmp-close') ui.before = null;
  else if (act === 'export') {
    const code = exportCode(state);
    const ta = $('#code');
    ta.value = code; ta.select();
    navigator.clipboard?.writeText(code).then(() => toast('Code kopiert.'), () => toast('Code markiert – bitte kopieren.'));
    return;
  } else if (act === 'import') {
    try {
      state = importCode($('#code').value);
      state.lastReal = Date.now();
      ui = { selectedItem: null, selectedTile: -1, sheet: null, before: null, showBefore: false };
      save(); toast('Spielstand geladen.');
    } catch (err) { toast('Der Code passt nicht.'); return; }
  } else if (act === 'reset') {
    if (!confirm('Wirklich ein neues Tal beginnen? Der jetzige Spielstand geht verloren.')) return;
    state = newGame({ startHour: new Date().getHours() + new Date().getMinutes() / 60 });
    ui = { selectedItem: null, selectedTile: -1, sheet: null, before: null, showBefore: false };
    save();
  } else if (act === 'reload') {
    window.__swWaiting?.postMessage('skip');
    return;
  }
  render();
});
$('#scrim').addEventListener('click', () => { ui.sheet = null; ui.selectedTile = -1; render(); });

function onTile(i) {
  if (ui.before && ui.showBefore) { ui.showBefore = false; render(); return; }
  if (ui.selectedItem != null) {
    const err = place(state, ui.selectedItem, i);
    if (err) toast(err);
    else { ui.selectedItem = null; save(); }
    render();
    return;
  }
  ui.selectedTile = i;
  ui.sheet = 'tile';
  render();
  state.tiles[i].seen = state.simHours; // gesehen, Marker verschwindet beim nächsten Bild
  save();
}

// ---------- Schleife ----------
function tick() {
  const now = Date.now();
  const dh = (now - state.lastReal) / 3600000;
  if (dh > 0.25) {
    // Länger weg gewesen (z. B. Tab im Hintergrund): mit Vorher-Nachher nachrechnen.
    const before = snapshot();
    const resBefore = { ...state.res };
    const { hours } = catchUp(state, now);
    showChanges(before, resBefore, hours > K.maxCatchUp ? `Du warst ${fmtDur(hours)} fort (${K.maxCatchUp} Std. nachgerechnet)` : `Während du fort warst (${fmtDur(hours)})`);
  } else {
    advance(state, dh);
    state.lastReal = now;
  }
  flushEvents();
  if (!ui.sheet || ui.sheet === 'forge' || ui.sheet === 'tile') render();
}

function boot() {
  state = load();
  tick();
  render();
  setInterval(tick, 1000);
  setInterval(save, 10000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else tick(); });
  window.addEventListener('pagehide', save);
}

// ---------- Service Worker / Versionshinweis ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const offer = w => {
      window.__swWaiting = w;
      const n = $('#update');
      n.hidden = false;
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; save(); location.reload(); } });
}

boot();
