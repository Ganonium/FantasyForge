// Balancing-Test ohne Browser: spielt mehrere Strategien über N Tage durch
// und zeigt, ob eine Wahl klar dominiert.
// Aufruf: node tools/balance.mjs [tage] [besuche-pro-tag]
import { newGame, advance, place, canPlace, startCraft, recipeStatus, tileLabel, NB, idxOf, handsFree } from '../js/sim.js';
import { RECIPES } from '../js/data.js';

const DAYS = +(process.argv[2] || 14);
const VISITS = +(process.argv[3] || 3);

// Jede Strategie: wie werden Stücke platziert (Bewertung je Feld) und was wird geschmiedet.
const STRATS = {
  'Kahlschlag am Dorf': {
    score: (s, it, t, i) => (it.id === 'axt' ? 100 - dist(i) * 10 + t.dichte / 10 : 50),
    craft: ['axt', 'spitzhacke', 'axt', 'angel', 'meiler', 'glut2'],
  },
  'Wald schonen (Axt nur in dichten Wald)': {
    score: (s, it, t, i) => (it.id === 'axt' ? (t.dichte >= 66 ? 100 + t.dichte - (NB[i].some(n => s.tiles[n].type === 'berg') ? 50 : 0) : -1) : 50),
    craft: ['angel', 'axt', 'spitzhacke', 'pflug', 'meiler', 'glut2'],
  },
  'Ackerbau zuerst': {
    score: (s, it, t, i) => (it.id === 'pflug' ? t.frucht : it.id === 'axt' ? t.dichte - (NB[i].some(n => s.tiles[n].type === 'berg') ? 80 : 0) : 50),
    craft: ['pflug', 'axt', 'angel', 'spitzhacke', 'brunnen', 'meiler', 'glut2'],
  },
  'Industrie (Meiler + Mühle)': {
    score: (s, it, t, i) => (it.id === 'meiler' ? t.dichte + NB[i].filter(n => s.tiles[n].type === 'wald').length * 30 : it.id === 'axt' ? t.dichte : 50),
    craft: ['axt', 'spitzhacke', 'meiler', 'spitzhacke', 'glut2', 'muehle', 'axt', 'angel'],
  },
  'Nichts tun': { score: () => -1, craft: [] },
};

function dist(i) {
  // Abstand zum Dorf (0,0) in Sechseck-Schritten
  const t = START_MAP_COORDS[i];
  return (Math.abs(t[0]) + Math.abs(t[1]) + Math.abs(t[0] + t[1])) / 2;
}
const START_MAP_COORDS = (await import('../js/data.js')).START_MAP;

function runStrategy(name, strat, seed) {
  const s = newGame({ seed });
  let c = 0;
  for (let v = 0; v < DAYS * VISITS; v++) {
    // Fertiges einsetzen: bestes Feld je Stück
    for (const it of [...s.inventory]) {
      let best = -1, bestScore = -Infinity;
      s.tiles.forEach((t, i) => {
        if (canPlace(s, it.uid, i)) return;
        const sc = strat.score(s, it, t, i);
        if (sc > bestScore && sc >= 0) { bestScore = sc; best = i; }
      });
      if (best >= 0) place(s, it.uid, best);
    }
    // Neues in die Esse legen: nächstes Rezept der Liste, das geht
    if (!s.esse.job && strat.craft.length) {
      for (let k = 0; k < strat.craft.length; k++) {
        const id = strat.craft[(c + k) % strat.craft.length];
        const built = s.tiles.some(t => t.building && t.building.id === id) || s.inventory.some(x => x.id === id);
        if (['meiler', 'muehle', 'brunnen'].includes(id) && built) continue;
        if (!recipeStatus(s, RECIPES.find(r => r.id === id))) { startCraft(s, id); c = c + k + 1; break; }
      }
    }
    advance(s, 24 / VISITS);
  }
  return s;
}

const fmt = n => n.toFixed(0).padStart(4);
console.log(`Balancing: ${DAYS} Tage, ${VISITS} Besuche pro Tag\n`);
for (const [name, strat] of Object.entries(STRATS)) {
  const runs = [1, 2, 3, 4, 5].map(seed => runStrategy(name, strat, seed));
  const avg = f => runs.reduce((a, s) => a + f(s), 0) / runs.length;
  const s = runs[0];
  const wald = s.tiles.filter(t => t.type === 'wald');
  console.log(`== ${name}`);
  console.log(`   Hände ${avg(x => x.village.pop).toFixed(1)}  Glut ${avg(x => x.esse.level).toFixed(1)}  Holz${fmt(avg(x => x.res.holz))}  Kohle${fmt(avg(x => x.res.kohle))}  Erz${fmt(avg(x => x.res.erz))}  Stein${fmt(avg(x => x.res.stein))}  Nahrung${fmt(avg(x => x.res.nahrung))}  Wolle${fmt(avg(x => x.res.wolle))}`);
  console.log(`   Wald Ø Dichte ${fmt(avg(x => x.tiles.filter(t => t.type === 'wald').reduce((a, t) => a + t.dichte, 0) / 4))}   Wild Ø ${fmt(avg(x => x.tiles.filter(t => t.type === 'wald').reduce((a, t) => a + t.wild, 0) / 4))}   Moore ${avg(x => x.tiles.filter(t => t.type === 'moor').length).toFixed(1)}`);
  console.log('   Felder (Lauf 1): ' + s.tiles.filter(t => t.type !== 'dorf' && (t.tool || t.building || ['wald', 'wiese'].includes(t.type))).map(t => tileLabel(t)).join(' | '));
  console.log('');
}
