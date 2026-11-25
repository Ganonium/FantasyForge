// Simulationskern. Reines JavaScript ohne DOM – läuft im Browser und in Node (Balancing-Test).
import { START_MAP, RIVER, DIRS, TOOLS, BUILDINGS, RECIPES, GLUT, START, K, itemName } from './data.js';

export const SAVE_VERSION = 1;

// ---------- Geometrie ----------
const INDEX = new Map(START_MAP.map(([q, r], i) => [q + ',' + r, i]));
export const idxOf = (q, r) => (INDEX.has(q + ',' + r) ? INDEX.get(q + ',' + r) : -1);
export const NB = START_MAP.map(([q, r]) => DIRS.map(([dq, dr]) => idxOf(q + dq, r + dr)).filter(i => i >= 0));
export const RIVER_IDX = RIVER.map(([q, r]) => idxOf(q, r));

// ---------- Zufall (deterministisch, im Spielstand gespeichert) ----------
function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- Neues Spiel ----------
export function makeTileStats(type) {
  switch (type) {
    case 'wald': return { dichte: 85, wild: 100, kraut: 80 };
    case 'wiese': return { frucht: 70, schafe: 100, acker: false, brache: 0, nass: 0, trocken: false };
    case 'fluss': return { fisch: 100 };
    case 'berg': return { tiefe: 0, gesperrt: 0 };
    case 'moor': return { magie: 80, kraut: 70, trocken: 0 };
    default: return {};
  }
}

export function newGame({ seed = Date.now() | 0, startHour = 8 } = {}) {
  const state = {
    v: SAVE_VERSION,
    rng: seed,
    simHours: 0,
    startHour,
    lastReal: Date.now(),
    nextUid: 1,
    res: { ...START.res },
    village: { pop: START.pop, growth: 0, hunger: 0 },
    esse: { level: 1, job: null },
    inventory: [],
    tiles: START_MAP.map(([q, r, type]) => ({
      q, r, type, ...makeTileStats(type), tool: null, building: null, notes: [], seen: 0,
    })),
    events: [], // flüchtige Meldungen für die Oberfläche
  };
  for (const id of START.inventory) state.inventory.push(newItem(state, id));
  // Kleine Unterschiede, damit nicht jedes Feld gleich ist.
  const t = state.tiles;
  t[idxOf(-2, 0)].dichte = 100; t[idxOf(-2, 0)].kraut = 100; // alter Wald im Westen
  t[idxOf(-1, 0)].dichte = 70;
  t[idxOf(-1, 2)].frucht = 55;
  return state;
}

function newItem(state, id) {
  const it = { uid: state.nextUid++, id };
  if (TOOLS[id]) it.dur = TOOLS[id].dur;
  return it;
}

// ---------- Hilfen ----------
function note(state, tile, text) {
  tile.notes.push({ h: state.simHours, text });
  if (tile.notes.length > 8) tile.notes.shift();
}
function event(state, text, tileIdx = -1) {
  state.events.push({ h: state.simHours, text, tile: tileIdx });
  if (state.events.length > 30) state.events.shift();
}
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const toward = (v, target, speed, dt) => (v < target ? Math.min(target, v + speed * dt) : Math.max(target, v - speed * dt));
const down = (a, b, thr) => a >= thr && b < thr;
const up = (a, b, thr) => a < thr && b >= thr;

export function handsUsed(state) {
  let n = 0;
  for (const t of state.tiles) {
    if (t.tool) n++;
    if (t.building && BUILDINGS[t.building.id].hands) n++;
  }
  return n;
}
export const handsFree = state => state.village.pop - handsUsed(state);

// Wer arbeitet gerade? Bei zu wenig Händen ruhen die zuletzt gesetzten Stücke.
function assignHands(state) {
  const jobs = [];
  state.tiles.forEach((t, i) => {
    if (t.tool) jobs.push({ at: t.tool.placedAt, set: v => (t.tool.active = v) });
    if (t.building && BUILDINGS[t.building.id].hands) jobs.push({ at: t.building.placedAt, set: v => (t.building.active = v) });
  });
  jobs.sort((a, b) => a.at - b.at);
  jobs.forEach((j, n) => j.set(n < state.village.pop));
}

export function damInfo(state) {
  // Liefert, welche Felder ein Damm beeinflusst: nasse (oberhalb) und trockene (unterhalb) Wiesen.
  const nass = new Set(), trocken = new Set(), lowFish = new Set();
  RIVER_IDX.forEach((ti, k) => {
    const t = state.tiles[ti];
    if (!(t.building && t.building.id === 'muehle')) return;
    lowFish.add(ti);
    if (k > 0) for (const n of NB[RIVER_IDX[k - 1]]) if (state.tiles[n].type === 'wiese') nass.add(n);
    for (let j = k + 1; j < RIVER_IDX.length; j++) {
      lowFish.add(RIVER_IDX[j]);
      for (const n of NB[RIVER_IDX[j]]) if (state.tiles[n].type === 'wiese') trocken.add(n);
    }
  });
  for (const n of nass) trocken.delete(n);
  return { nass, trocken, lowFish };
}

export function smokeSet(state) {
  const s = new Set();
  state.tiles.forEach((t, i) => {
    if (t.building && t.building.id === 'meiler' && t.building.active && !t.building.cold) for (const n of NB[i]) s.add(n);
  });
  return s;
}

export function hasMill(state) {
  return state.tiles.some(t => t.building && t.building.id === 'muehle');
}

export function esseSpeed(state) {
  return GLUT[state.esse.level].speed * (hasMill(state) ? 1.5 : 1);
}

// ---------- Ein Simulationsschritt ----------
function step(state, dt) {
  const T = state.tiles;
  const R = state.res;
  assignHands(state);
  const smoke = smokeSet(state);
  const dam = damInfo(state);

  // Bauwerke
  T.forEach((t, i) => {
    const b = t.building;
    if (!b) return;
    if (b.id === 'meiler' && b.active) {
      // Frisst den dichtesten Wald in Reichweite (eigenes Feld + Nachbarn).
      let best = -1;
      for (const j of [i, ...NB[i]]) if (T[j].type === 'wald' && T[j].dichte > 0 && (best < 0 || T[j].dichte > T[best].dichte)) best = j;
      if (best < 0) {
        if (!b.cold) { b.cold = true; note(state, t, 'Der Meiler ist erkaltet: Im Umkreis gibt es kein Holz mehr.'); }
      } else {
        if (b.cold) { b.cold = false; note(state, t, 'Der Wald ist nachgewachsen, der Meiler glimmt wieder.'); }
        const w = T[best];
        const before = w.dichte;
        w.dichte = clamp(w.dichte - K.meilerFrisst * dt);
        R.kohle += K.meilerKohle * dt;
        woodThresholds(state, w, best, before, 'Der Köhlermeiler nebenan');
      }
    }
  });

  // Werkzeuge
  T.forEach((t, i) => {
    const tool = t.tool;
    if (!tool || !tool.active) return;
    const id = tool.id;
    if (id === 'axt' || id === 'feenaxt') {
      if (t.dichte <= 0) return;
      const before = t.dichte;
      if (id === 'axt') {
        R.holz += (t.dichte >= 33 ? K.axtHolz : K.axtHolzThin) * dt;
        t.dichte = clamp(t.dichte - K.axtDichte * dt);
      } else {
        R.holz += K.feenHolz * dt;
        t.dichte = clamp(t.dichte - K.feenDichte * dt);
      }
      woodThresholds(state, t, i, before, id === 'axt' ? 'Die Axt' : 'Die Feenaxt');
    } else if (id === 'pflug') {
      if (!t.acker) { t.acker = true; note(state, t, 'Der Pflug bricht die Wiese um. Auf dem Acker ist kein Platz mehr für Schafe.'); }
      t.brache = 0;
      const before = t.frucht;
      R.nahrung += K.pflugNahrung * (0.2 + t.frucht / 100) * dt;
      t.frucht = clamp(t.frucht - K.pflugFrucht * dt);
      if (down(before, t.frucht, 25)) note(state, t, 'Der Acker ist ausgelaugt, die Ernte wird mager.');
    } else if (id === 'angel') {
      const before = t.fisch;
      R.nahrung += K.angelNahrung * (t.fisch / 100) * dt;
      t.fisch = clamp(t.fisch - K.angelFisch * dt);
      if (down(before, t.fisch, 30)) note(state, t, 'Die Angel holt kaum noch etwas heraus: Der Fluss ist hier leergefischt.');
    } else if (id === 'spitzhacke') {
      if (t.gesperrt > 0) return;
      const before = t.tiefe;
      R.erz += K.hackeErz * (1 + t.tiefe / 60) * dt;
      R.stein += K.hackeStein * dt;
      t.tiefe += K.hackeTiefe * dt;
      if (up(before, t.tiefe, 30)) note(state, t, 'Der Stollen reicht tief. Das Erz wird reicher, aber die Decke knackt.');
      if (up(before, t.tiefe, 60)) note(state, t, 'Tief unten grollt etwas im Fels …');
      const p = Math.max(0, t.tiefe - K.einsturzAb) / K.einsturzDiv;
      if (rand(state) < p * dt) {
        t.gesperrt = K.gesperrt;
        t.tiefe = Math.max(0, t.tiefe - 10);
        t.tool = null;
        note(state, t, 'Der Stollen ist eingestürzt! Die Spitzhacke ist verschüttet, der Berg bleibt eine Weile gesperrt.');
        event(state, 'Ein Stollen ist eingestürzt!', i);
      }
    } else if (id === 'sense') {
      const before = t.kraut;
      if (t.type === 'wald') R.kraeuter += K.senseKraut * (t.kraut / 100) * dt;
      else {
        R.moorkraut += K.senseMoorkraut * (t.kraut / 100) * dt;
        const m = t.magie;
        t.magie = clamp(t.magie - 0.3 * dt);
        if (down(m, t.magie, 30)) note(state, t, 'Die Sense stört das Moor: Die Irrlichter werden blass.');
      }
      t.kraut = clamp(t.kraut - K.senseVerbrauch * dt);
      if (down(before, t.kraut, 20)) note(state, t, 'Hier ist kaum noch etwas zu ernten: Die Sense hat die Kräuter abgemäht.');
    } else if (id === 'spaten') {
      R.erz += K.spatenErz * dt;
      const m = t.magie;
      t.trocken = clamp(t.trocken + (100 / K.spatenStunden) * dt);
      t.magie = clamp(t.magie - 3 * dt);
      if (down(m, t.magie, 30)) note(state, t, 'Die Gräben ziehen das Wasser ab. Die Irrlichter werden blass.');
      if (t.trocken >= 100) {
        returnTool(state, i);
        convert(t, 'wiese', { frucht: 75 });
        note(state, t, 'Das Moor ist trockengelegt: guter neuer Boden. Die Irrlichter sind für immer erloschen.');
        event(state, 'Ein Moor wurde trockengelegt.', i);
      }
    }
    if (t.tool) {
      t.tool.dur -= dt;
      if (t.tool.dur <= 0) {
        note(state, t, itemName(t.tool.id) + ' ist abgenutzt und zerbrochen.');
        event(state, itemName(t.tool.id) + ' ist verbraucht.', i);
        t.tool = null;
      }
    }
  });

  // Natur
  T.forEach((t, i) => {
    const smoky = smoke.has(i);
    if (t.type === 'wald') {
      const cutting = t.tool && t.tool.active && t.tool.id === 'axt';
      if (!cutting && !(t.tool && t.tool.id === 'feenaxt' && t.tool.active)) {
        const before = t.dichte;
        t.dichte = clamp(t.dichte + (t.dichte > 0 ? K.waldRegrow : K.waldRegrowBare) * dt);
        if (up(before, t.dichte, 33)) note(state, t, 'Der Wald wächst nach und ist wieder licht.');
        if (up(before, t.dichte, 66)) note(state, t, 'Der Wald ist wieder dicht.');
      }
      let wTarget = t.dichte >= 60 ? 100 : t.dichte >= 30 ? 50 : 0;
      if (cutting || smoky) wTarget = Math.min(wTarget, 15);
      const w0 = t.wild;
      t.wild = toward(t.wild, wTarget, K.wildSpeed, dt);
      if (down(w0, t.wild, 50)) {
        const why = smoky ? 'der Rauch des Meilers vertreibt es' : cutting ? 'die Axt hallt durch den Wald' : 'der Wald ist zu licht geworden';
        note(state, t, 'Das Wild ist fortgezogen – ' + why + '. Dem Dorf fehlt Fleisch.');
      }
      if (up(w0, t.wild, 50)) note(state, t, 'Das Wild ist zurückgekehrt.');
      R.nahrung += K.wildPassiv * (t.wild / 100) * dt;
      let kTarget = t.dichte >= 40 ? 100 : (t.dichte / 40) * 50;
      if (smoky) kTarget *= 0.2;
      const k0 = t.kraut;
      if (!(t.tool && t.tool.id === 'sense' && t.tool.active) || t.kraut > kTarget) t.kraut = toward(t.kraut, kTarget, K.krautSpeed, dt);
      if (down(k0, t.kraut, 30)) note(state, t, smoky ? 'Der Rauch des Meilers verdirbt die Kräuter.' : 'Ohne Schatten verdorren die Kräuter.');
      if (up(k0, t.kraut, 30)) note(state, t, 'Kräuter sprießen wieder.');
    } else if (t.type === 'wiese') {
      const plowing = t.tool && t.tool.active && t.tool.id === 'pflug';
      if (t.acker && !plowing) {
        t.brache += dt;
        if (t.brache >= K.bracheBack) { t.acker = false; t.brache = 0; note(state, t, 'Der brachliegende Acker ist wieder zur Wiese geworden.'); }
      }
      const f0 = t.frucht;
      if (!plowing) t.frucht = clamp(t.frucht + K.wieseRegrow * dt);
      // Brunnen in der Nähe
      if (NB[i].some(n => T[n].building && T[n].building.id === 'brunnen')) t.frucht = clamp(t.frucht + K.brunnenFrucht * dt);
      if (smoky) t.frucht = clamp(t.frucht - K.rauchFrucht * dt);
      const wasDry = t.trocken;
      t.trocken = dam.trocken.has(i);
      if (t.trocken) t.frucht = clamp(t.frucht - K.trockenFrucht * dt);
      if (t.trocken && !wasDry) note(state, t, 'Unterhalb des Damms führt der Fluss weniger Wasser. Die Wiese trocknet aus.');
      if (!t.trocken && wasDry) note(state, t, 'Das Wasser ist zurück, die Wiese erholt sich.');
      if (down(f0, t.frucht, 25)) note(state, t, smoky ? 'Der Rauch vertreibt die Bienen, die Wiese verarmt.' : t.trocken ? 'Die Trockenheit macht die Wiese karg.' : 'Der Boden ist karg geworden.');
      if (up(f0, t.frucht, 50) && !t.acker) note(state, t, 'Die Wiese hat sich erholt.');
      // Schafe
      let sTarget = t.acker || t.building ? 0 : t.frucht >= 30 ? 100 : 40;
      if (t.trocken) sTarget *= 0.5;
      const s0 = t.schafe;
      t.schafe = toward(t.schafe, sTarget, K.schafSpeed, dt);
      if (down(s0, t.schafe, 50) && !t.acker) note(state, t, 'Die Schafe finden zu wenig Futter und ziehen weiter.');
      if (up(s0, t.schafe, 50)) note(state, t, 'Schafe weiden wieder hier.');
      R.wolle += K.wollePassiv * (t.schafe / 100) * dt;
      // Versumpfung oberhalb eines Damms
      if (dam.nass.has(i) && !t.building) {
        t.nass += dt;
        if (t.nass >= K.dammNass) {
          if (t.tool) returnTool(state, i);
          convert(t, 'moor', { magie: 20, kraut: 30 });
          note(state, t, 'Der Damm staut das Wasser zurück: Die Wiese ist zu Moor geworden.');
          event(state, 'Eine Wiese ist versumpft.', i);
        } else if (t.nass >= K.dammNass / 2 && t.nass - dt < K.dammNass / 2) {
          note(state, t, 'Der Boden wird schwammig – das gestaute Wasser steigt.');
        }
      } else t.nass = Math.max(0, t.nass - dt);
    } else if (t.type === 'fluss') {
      const cap = dam.lowFish.has(i) ? K.fischCapDamm : 100;
      const f0 = t.fisch;
      if (!(t.tool && t.tool.active && t.tool.id === 'angel')) t.fisch = toward(t.fisch, cap, K.fischRegrow, dt);
      if (t.fisch > cap) t.fisch = toward(t.fisch, cap, 2, dt);
      if (down(f0, t.fisch, 50) && dam.lowFish.has(i)) note(state, t, 'Der Damm versperrt den Fischen den Weg.');
      if (up(f0, t.fisch, 60)) note(state, t, 'Die Fische sind zurück.');
    } else if (t.type === 'berg') {
      if (t.gesperrt > 0) {
        t.gesperrt -= dt;
        if (t.gesperrt <= 0) { t.gesperrt = 0; note(state, t, 'Der eingestürzte Stollen ist wieder freigeräumt.'); }
      }
    } else if (t.type === 'moor') {
      const draining = t.tool && t.tool.active && t.tool.id === 'spaten';
      const m0 = t.magie;
      if (!draining && !(t.tool && t.tool.active && t.tool.id === 'sense')) t.magie = clamp(t.magie + K.moorMagie * dt);
      if (up(m0, t.magie, 60)) note(state, t, 'Irrlichter tanzen wieder über dem Moor.');
      if (!(t.tool && t.tool.active && t.tool.id === 'sense')) t.kraut = clamp(t.kraut + K.moorKraut * dt);
    }
  });

  // Dorf
  const v = state.village;
  const dorf = T[idxOf(0, 0)];
  R.nahrung -= K.eat * v.pop * dt;
  if (R.nahrung > 0) {
    v.hunger = 0;
    let speed = 1;
    if (NB[idxOf(0, 0)].some(n => T[n].building && T[n].building.id === 'brunnen')) speed += 0.5;
    // Kräuter (Heilmittel) und Wolle (Kleidung) lassen das Dorf schneller wachsen und werden dabei verbraucht.
    if (R.kraeuter > 0) { speed += 0.5; R.kraeuter = Math.max(0, R.kraeuter - 0.02 * dt); }
    if (R.wolle > 0) { speed += 0.3; R.wolle = Math.max(0, R.wolle - 0.02 * dt); }
    if (v.pop < K.popMax) v.growth += speed * dt;
    if (v.growth >= K.growNeed) {
      v.growth = 0; v.pop++;
      note(state, dorf, 'Das Dorf ist gut versorgt und wächst: ein neues Paar Hände.');
      event(state, 'Das Dorf wächst! Jetzt ' + v.pop + ' Hände.', idxOf(0, 0));
    }
  } else {
    R.nahrung = 0;
    v.growth = Math.max(0, v.growth - dt);
    v.hunger += dt;
    if (v.hunger >= 6 && v.hunger - dt < 6) note(state, dorf, 'Die Vorräte sind leer. Das Dorf hungert.');
    if (v.hunger >= K.starveHours) {
      v.hunger = 0;
      if (v.pop > K.popMin) {
        v.pop--;
        note(state, dorf, 'Eine Familie hat das hungernde Dorf verlassen.');
        event(state, 'Hunger: Eine Familie zieht fort.', idxOf(0, 0));
      }
    }
  }

  // Esse
  const job = state.esse.job;
  if (job) {
    job.left -= esseSpeed(state) * dt;
    if (job.left <= 0) {
      const rec = RECIPES.find(r => r.id === job.id);
      if (rec.kind === 'upgrade') {
        state.esse.level = rec.to;
        event(state, 'Die Esse brennt jetzt mit ' + GLUT[rec.to].name + '.');
      } else {
        state.inventory.push(newItem(state, rec.id));
        event(state, itemName(rec.id) + ' ist fertig geschmiedet.');
      }
      state.esse.job = null;
    }
  }

  state.simHours += dt;
}

function woodThresholds(state, t, i, before, who) {
  if (down(before, t.dichte, 66)) note(state, t, who + ' hat den Wald gelichtet.');
  if (down(before, t.dichte, 33)) note(state, t, who + ' hat den Wald schütter gemacht. Hier wächst kaum noch etwas.');
  if (before > 0 && t.dichte <= 0) {
    note(state, t, who + ' hat den Wald gerodet.');
    landslide(state, i);
  }
}

function landslide(state, i) {
  const T = state.tiles;
  if (!NB[i].some(n => T[n].type === 'berg')) return;
  note(state, T[i], 'Ohne Wurzeln hält der Hang nicht: Er ist abgerutscht.');
  event(state, 'Erdrutsch am gerodeten Hang!', i);
  for (const n of NB[i]) {
    const t = T[n];
    if (t.type === 'wiese') { t.frucht = clamp(t.frucht - 25); note(state, t, 'Geröll vom gerodeten Hang hat die Wiese verschüttet.'); }
    else if (t.type === 'wald') { t.dichte = clamp(t.dichte - 15); note(state, t, 'Der Erdrutsch vom Nachbarhang hat Bäume mitgerissen.'); }
    else if (t.type === 'dorf') {
      state.village.growth = 0;
      note(state, t, 'Der Erdrutsch vom gerodeten Hang hat Häuser beschädigt. Das Dorf muss erst wieder aufbauen.');
    }
  }
}

function convert(t, type, overrides = {}) {
  for (const k of ['dichte', 'wild', 'kraut', 'frucht', 'schafe', 'acker', 'brache', 'nass', 'trocken', 'fisch', 'tiefe', 'gesperrt', 'magie']) delete t[k];
  Object.assign(t, makeTileStats(type), overrides);
  t.type = type;
}

// ---------- Zeit ----------
export function advance(state, hours) {
  while (hours > 1e-9) {
    const dt = Math.min(0.25, hours);
    step(state, dt);
    hours -= dt;
  }
}

// Echte Zeit seit dem letzten Besuch nachrechnen (höchstens K.maxCatchUp Stunden).
export function catchUp(state, now = Date.now()) {
  const hours = Math.max(0, (now - state.lastReal) / 3600000);
  const sim = Math.min(hours, K.maxCatchUp);
  advance(state, sim);
  state.lastReal = now;
  return { hours, sim };
}

// ---------- Aktionen ----------
export function canPlace(state, uid, ti) {
  const it = state.inventory.find(x => x.uid === uid);
  if (!it) return 'Unbekanntes Stück.';
  const t = state.tiles[ti];
  const def = TOOLS[it.id] || BUILDINGS[it.id];
  if (!def.on.includes(t.type)) return def.name + ' passt nicht auf ' + t.type + '.';
  if (TOOLS[it.id]) {
    if (t.tool) return 'Hier arbeitet schon ' + itemName(t.tool.id) + '.';
    if (t.building) return 'Das Feld ist durch ' + itemName(t.building.id) + ' belegt.';
    if (t.type === 'berg' && t.gesperrt > 0) return 'Der Stollen ist eingestürzt.';
    if (t.type === 'wald' && t.dichte <= 0) return 'Hier steht kein Baum mehr.';
    if (handsFree(state) < 1) return 'Keine freie Hand im Dorf.';
  } else {
    if (t.tool || t.building) return 'Das Feld ist belegt.';
    if (it.id === 'muehle' && RIVER_IDX.indexOf(ti) < 1) return 'Hier fehlt Gefälle für den Damm.';
    if (it.id === 'brunnen' && t.acker) return 'Auf dem Acker ist kein Platz für einen Brunnen.';
    if (BUILDINGS[it.id].hands && handsFree(state) < 1) return 'Keine freie Hand im Dorf.';
  }
  return null;
}

export function place(state, uid, ti) {
  const err = canPlace(state, uid, ti);
  if (err) return err;
  const k = state.inventory.findIndex(x => x.uid === uid);
  const it = state.inventory.splice(k, 1)[0];
  const t = state.tiles[ti];
  if (TOOLS[it.id]) {
    t.tool = { uid: it.uid, id: it.id, dur: it.dur, maxDur: TOOLS[it.id].dur, placedAt: state.simHours, active: true };
    note(state, t, itemName(it.id) + ' wurde hier eingesetzt.');
  } else {
    t.building = { id: it.id, placedAt: state.simHours, active: true };
    note(state, t, itemName(it.id) + ' wurde hier gebaut.');
  }
  t.seen = state.simHours + 0.001;
  return null;
}

export function returnTool(state, ti) {
  const t = state.tiles[ti];
  if (!t.tool) return;
  state.inventory.push({ uid: t.tool.uid, id: t.tool.id, dur: t.tool.dur });
  t.tool = null;
}

export function recipeStatus(state, rec) {
  if (state.esse.level < rec.level) return 'Braucht ' + GLUT[rec.level].name + '.';
  if (rec.kind === 'upgrade' && state.esse.level >= rec.to) return 'Schon erreicht.';
  for (const [r, n] of Object.entries(rec.cost)) if ((state.res[r] || 0) < n - 1e-9) return 'Zu wenig Rohstoffe.';
  if (state.esse.job) return 'Die Esse ist belegt.';
  return null;
}

export function startCraft(state, id) {
  const rec = RECIPES.find(r => r.id === id);
  const err = recipeStatus(state, rec);
  if (err) return err;
  for (const [r, n] of Object.entries(rec.cost)) state.res[r] -= n;
  state.esse.job = { id, left: rec.hours, total: rec.hours };
  return null;
}

// ---------- Beschriftungen ----------
export function tileLabel(t) {
  switch (t.type) {
    case 'wald': return 'Wald, ' + (t.dichte >= 66 ? 'dicht' : t.dichte >= 33 ? 'licht' : t.dichte > 0 ? 'schütter' : 'gerodet');
    case 'wiese':
      if (t.acker) return t.frucht < 25 ? 'Acker, ausgelaugt' : 'Acker';
      return 'Wiese, ' + (t.trocken ? 'trocken' : t.frucht < 25 ? 'karg' : t.frucht < 55 ? 'mager' : 'saftig');
    case 'fluss': return 'Fluss, ' + (t.fisch >= 60 ? 'fischreich' : t.fisch >= 25 ? 'wenig Fisch' : 'leergefischt');
    case 'berg': return t.gesperrt > 0 ? 'Berg, Stollen eingestürzt' : t.tiefe <= 0 ? 'Berg, unberührt' : t.tiefe < 30 ? 'Berg mit Stollen' : t.tiefe < 60 ? 'Berg, tiefer Stollen' : 'Berg, sehr tiefer Stollen';
    case 'moor': return 'Moor, ' + (t.magie >= 60 ? 'Irrlichter tanzen' : t.magie >= 25 ? 'still' : 'entzaubert');
    case 'dorf': return 'Dorf';
  }
  return t.type;
}

export function hasNews(t) {
  return t.notes.some(n => n.h > t.seen);
}

export function clockText(state, extraHours = 0) {
  const total = state.startHour + state.simHours + extraHours;
  const day = Math.floor(total / 24) + 1;
  const h = Math.floor(total % 24);
  const m = Math.floor((total * 60) % 60);
  return { day, hh: String(h).padStart(2, '0'), mm: String(m).padStart(2, '0'), hour: total % 24 };
}

// ---------- Speichern ----------
export function serialize(state) {
  const { events, ...rest } = state;
  return JSON.stringify(rest);
}
export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.v !== SAVE_VERSION || !Array.isArray(s.tiles)) throw new Error('Unbekannter Spielstand');
  s.events = [];
  return s;
}
export function exportCode(state) {
  const bytes = new TextEncoder().encode(serialize(state));
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
export function importCode(code) {
  const bin = atob(code.trim());
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return deserialize(new TextDecoder().decode(bytes));
}
