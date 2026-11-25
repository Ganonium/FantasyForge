// Spieldaten: Karte, Werkzeuge, Bauwerke, Rezepte, Glut-Stufen.
// Alle Raten sind "pro Stunde" (echte Stunde = Spielstunde).

export const RES = {
  holz: 'Holz',
  kohle: 'Kohle',
  erz: 'Erz',
  stein: 'Stein',
  nahrung: 'Nahrung',
  wolle: 'Wolle',
  kraeuter: 'Kräuter',
  moorkraut: 'Moorkraut',
};

// Feste Startkarte: 19 Sechsecke (axiale Koordinaten q,r; Radius 2).
// Der Fluss kommt von Norden aus den Bergen und mündet im Süden ins Moor.
export const START_MAP = [
  [0, -2, 'berg'], [1, -2, 'fluss'], [2, -2, 'berg'],
  [-1, -1, 'wald'], [0, -1, 'berg'], [1, -1, 'fluss'], [2, -1, 'wiese'],
  [-2, 0, 'wald'], [-1, 0, 'wald'], [0, 0, 'dorf'], [1, 0, 'fluss'], [2, 0, 'wiese'],
  [-2, 1, 'wald'], [-1, 1, 'wiese'], [0, 1, 'wiese'], [1, 1, 'fluss'],
  [-2, 2, 'moor'], [-1, 2, 'wiese'], [0, 2, 'moor'],
];

// Flusslauf von oben (Quelle) nach unten (Mündung).
export const RIVER = [[1, -2], [1, -1], [1, 0], [1, 1]];
// Wohin der Fluss am Ende fließt (Moor-Feld) und woher er kommt (außerhalb).
export const RIVER_IN = [1, -3];
export const RIVER_OUT = [0, 2];

export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const TERRAIN = {
  wald: { name: 'Wald' },
  wiese: { name: 'Wiese' },
  fluss: { name: 'Fluss' },
  berg: { name: 'Berg' },
  moor: { name: 'Moor' },
  dorf: { name: 'Dorf' },
};

// Werkzeuge: werden auf ein Feld gesetzt, brauchen eine Hand, nutzen sich ab (dur = Arbeitsstunden).
export const TOOLS = {
  axt: {
    name: 'Axt', dur: 16, on: ['wald'],
    gives: 'Holz', takes: 'Wald wird lichter, Wild zieht weg, an Hängen droht Erdrutsch',
  },
  feenaxt: {
    name: 'Feenaxt', dur: 30, on: ['wald'],
    gives: 'Etwas Holz, schont den Wald', takes: 'Teuer: braucht Moorkraut und magische Glut',
  },
  pflug: {
    name: 'Pflug', dur: 48, on: ['wiese'],
    gives: 'Getreide (Nahrung)', takes: 'Schafe ziehen ab, der Boden laugt aus',
  },
  spitzhacke: {
    name: 'Spitzhacke', dur: 20, on: ['berg'],
    gives: 'Erz und Stein, tiefer = mehr Erz', takes: 'Je tiefer, desto größer die Einsturzgefahr',
  },
  sense: {
    name: 'Sense', dur: 16, on: ['wald', 'moor'],
    gives: 'Kräuter (Wald) oder Moorkraut (Moor)', takes: 'Bestand schrumpft, im Moor verblassen die Irrlichter',
  },
  angel: {
    name: 'Angel', dur: 24, on: ['fluss'],
    gives: 'Fisch (Nahrung)', takes: 'Der Fluss wird leergefischt',
  },
  spaten: {
    name: 'Spaten', dur: 36, on: ['moor'],
    gives: 'Raseneisenerz, am Ende neuer Wiesenboden', takes: 'Moorkraut und Irrlichter verschwinden für immer',
  },
};

// Bauwerke: belegen ein Feld dauerhaft und wirken auf die Nachbarn.
export const BUILDINGS = {
  meiler: {
    name: 'Köhlermeiler', on: ['wald'], hands: 1,
    gives: 'Holzkohle für eine heißere Esse', takes: 'Frisst Wald im Umkreis, Rauch vertreibt Wild, Kräuter und Bienen nebenan',
  },
  muehle: {
    name: 'Wassermühle mit Damm', on: ['fluss'], hands: 0,
    gives: 'Hammerwerk: die Esse arbeitet 1,5× so schnell', takes: 'Oberhalb versumpft die Wiese, unterhalb trocknet sie aus, weniger Fisch',
  },
  brunnen: {
    name: 'Brunnen', on: ['wiese'], hands: 0,
    gives: 'Nachbarwiesen werden fruchtbarer, am Dorf wächst es schneller', takes: 'Belegt die Wiese, kostet viel Stein',
  },
};

export const GLUT = [
  null,
  { name: 'Holzfeuer', speed: 1 },
  { name: 'Holzkohle-Glut', speed: 1.5 },
  { name: 'Magische Glut', speed: 2 },
];

// Rezepte der Esse. hours = Schmiededauer bei Geschwindigkeit 1.
export const RECIPES = [
  { id: 'axt', kind: 'tool', cost: { holz: 2, erz: 2 }, hours: 3, level: 1 },
  { id: 'angel', kind: 'tool', cost: { holz: 2, wolle: 1 }, hours: 1, level: 1 },
  { id: 'spitzhacke', kind: 'tool', cost: { holz: 1, erz: 3 }, hours: 3, level: 1 },
  { id: 'sense', kind: 'tool', cost: { holz: 1, erz: 1 }, hours: 2, level: 1 },
  { id: 'pflug', kind: 'tool', cost: { holz: 3, erz: 2 }, hours: 5, level: 1 },
  { id: 'spaten', kind: 'tool', cost: { holz: 2, erz: 1 }, hours: 3, level: 1 },
  { id: 'meiler', kind: 'building', cost: { holz: 4, stein: 3 }, hours: 6, level: 1 },
  { id: 'brunnen', kind: 'building', cost: { stein: 6 }, hours: 8, level: 1 },
  { id: 'glut2', kind: 'upgrade', to: 2, name: 'Holzkohle-Glut', cost: { kohle: 6, stein: 4 }, hours: 6, level: 1,
    gives: 'Esse arbeitet 1,5× so schnell, Wassermühle wird möglich' },
  { id: 'muehle', kind: 'building', cost: { holz: 6, stein: 4, erz: 3 }, hours: 12, level: 2 },
  { id: 'glut3', kind: 'upgrade', to: 3, name: 'Magische Glut', cost: { kohle: 10, moorkraut: 3 }, hours: 12, level: 2,
    gives: 'Esse arbeitet 2× so schnell, Feenaxt wird möglich' },
  { id: 'feenaxt', kind: 'tool', cost: { holz: 2, erz: 2, moorkraut: 2 }, hours: 8, level: 3 },
];

export function itemName(id) {
  return (TOOLS[id] || BUILDINGS[id] || RECIPES.find(r => r.id === id) || { name: id }).name;
}

export const START = {
  res: { holz: 6, kohle: 0, erz: 5, stein: 3, nahrung: 12, wolle: 1, kraeuter: 0, moorkraut: 0 },
  pop: 3,
  inventory: ['axt', 'angel', 'spitzhacke'],
};

// Wirkungs-Konstanten (alle pro Stunde) – an einer Stelle, damit Balancing leicht fällt.
export const K = {
  maxCatchUp: 24, // Stunden, die nach Abwesenheit nachgerechnet werden
  eat: 0.08, // Nahrung je Dorfbewohner
  growNeed: 36, // Stunden gut versorgt bis +1 Bewohner
  starveHours: 24, // Stunden Hunger bis -1 Bewohner
  popMin: 2, popMax: 12,

  waldRegrow: 0.4, waldRegrowBare: 0.12,
  axtHolz: 0.6, axtHolzThin: 0.35, axtDichte: 3,
  feenHolz: 0.35, feenDichte: 0.8,
  wildPassiv: 0.06, wildSpeed: 3,
  krautSpeed: 1,

  pflugNahrung: 0.55, pflugFrucht: 0.9, wieseRegrow: 0.15, bracheBack: 72,
  wollePassiv: 0.015, schafSpeed: 2,

  angelNahrung: 0.6, angelFisch: 2, fischRegrow: 0.4, fischCapDamm: 40,

  hackeErz: 0.35, hackeStein: 0.3, hackeTiefe: 0.6, einsturzAb: 15, einsturzDiv: 1500, gesperrt: 36,

  senseKraut: 0.3, senseMoorkraut: 0.12, senseVerbrauch: 2,
  moorMagie: 0.15, moorKraut: 0.4, spatenErz: 0.25, spatenStunden: 30,

  meilerKohle: 0.25, meilerFrisst: 1.2, rauchKraut: 1.5, rauchFrucht: 0.1,
  dammNass: 48, trockenFrucht: 0.25,
  brunnenFrucht: 0.25,
};
