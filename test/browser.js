// Browser checks, Scryfall answered locally: node test/browser.js <base-url> <card.jpg> [screenshot-dir]
const { chromium } = require('playwright-core');
const fs = require('fs');
const [base, imgPath, out] = process.argv.slice(2);
const img = fs.readFileSync(imgPath);
let fails = 0;
const say = (good, msg) => { if (!good) fails++; console.log(`${good ? 'ok  ' : 'FAIL'} ${msg}`); };
const shot = (p, name) => out && p.locator('.mtg-decklist').first().screenshot({ path: `${out}/${name}.png` });

// What /cards/collection gives for the cards of test/pages, keyed by the name asked
const face = (name, type_line, mana_cost) => ({ name, type_line, mana_cost });
const CARDS = {
  'lightning bolt': { name: 'Lightning Bolt', type_line: 'Instant', mana_cost: '{R}', cmc: 1, set: 'm10', collector_number: '146' },
  'monastery swiftspear': { name: 'Monastery Swiftspear', type_line: 'Creature — Human Monk', mana_cost: '{R}', cmc: 1 },
  'delver of secrets': { name: 'Delver of Secrets // Insectile Aberration', type_line: 'Creature — Human Wizard // Creature — Human Insect', cmc: 1,
    card_faces: [face('Delver of Secrets', 'Creature — Human Wizard', '{U}'), face('Insectile Aberration', 'Creature — Human Insect', '')] },
  fire: { name: 'Fire // Ice', type_line: 'Instant // Instant', mana_cost: '{1}{R} // {1}{U}', cmc: 4,
    card_faces: [face('Fire', 'Instant', '{1}{R}'), face('Ice', 'Instant', '{1}{U}')] },
  'kitchen finks': { name: 'Kitchen Finks', type_line: 'Creature — Ouphe', mana_cost: '{1}{G/W}{G/W}', cmc: 3 },
  'gut shot': { name: 'Gut Shot', type_line: 'Instant', mana_cost: '{R/P}', cmc: 1 },
  'jace, the mind sculptor': { name: 'Jace, the Mind Sculptor', type_line: 'Legendary Planeswalker — Jace', mana_cost: '{2}{U}{U}', cmc: 4 },
  mountain: { name: 'Mountain', type_line: 'Basic Land — Mountain', mana_cost: '', cmc: 0 },
  duress: { name: 'Duress', type_line: 'Sorcery', mana_cost: '{B}', cmc: 1, set: 'm20', collector_number: '96' },
  // test/pages/05.commander: by printing only (names Scryfall would not find)
  'p:cmd/181': { name: 'Animar, Soul of Elements', type_line: 'Legendary Creature — Elemental', mana_cost: '{U}{R}{G}', cmc: 3, set: 'cmd', collector_number: '181' },
  'p:mom/298': { name: 'Etali, Primal Conqueror // Etali, Primal Sickness', type_line: 'Legendary Creature — Elder Giant // Legendary Creature — Phyrexian Elder Giant', cmc: 7, set: 'mom', collector_number: '298',
    card_faces: [face('Etali, Primal Conqueror', 'Legendary Creature — Elder Giant', '{5}{R}{R}'), face('Etali, Primal Sickness', 'Legendary Creature — Phyrexian Elder Giant', '')] },
  'p:plg20/2': { name: 'Hangarback Walker', flavor_name: 'Mechagodzilla, Battle Fortress', type_line: 'Artifact Creature — Construct', mana_cost: '{X}{X}', cmc: 0, set: 'plg20', collector_number: '2' },
  forest: { name: 'Forest', type_line: 'Basic Land — Forest', mana_cost: '', cmc: 0 },
};
// By name, or by printing: what was asked, and the card Scryfall would give
const id = i => i.name || i.set + '/' + i.collector_number;
const card = i => i.name ? CARDS[i.name.toLowerCase()] : CARDS['p:' + i.set + '/' + i.collector_number] || Object.values(CARDS).find(c => c.set === i.set && c.collector_number === i.collector_number);
const fake = (c, asked, down) => Promise.all([
  c.route('https://api.scryfall.com/cards/collection', r => {
    const ids = r.request().postDataJSON().identifiers;
    asked.push(ids.map(id));
    if (down) return r.fulfill({ status: 503, body: '' });
    const data = ids.map(card).filter(Boolean);
    const not_found = ids.filter(i => !card(i));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ object: 'list', not_found, data }) });
  }),
  c.route(/api\.scryfall\.com\/cards\/(named|[a-z0-9]+\/)/, r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: img })),
]);
const errors = p => { const e = []; p.on('pageerror', x => e.push(x.message)); return e; };

(async () => {
  const browser = await chromium.launch();
  {
    const asked = [], c = await browser.newContext({ viewport: { width: 1000, height: 900 } }); await fake(c, asked);
    await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const p = await c.newPage(), errs = errors(p);
    await p.goto(base + '/home', { waitUntil: 'networkidle' });
    await p.waitForSelector('.mtg-decklist-groups', { timeout: 5000 }).catch(() => {});
    const flat = asked.flat();
    // Foudre is asked once, by name: no second request
    say(asked.length === 1 && flat.length === 10 && flat.includes('m10/146') && flat.includes('Fire') && !flat.includes('Fire // Ice'),
      `one request, 10 identifiers, printing when the export gives it, split card by its first half: ${JSON.stringify(asked)}`);
    const groups = await p.$$eval('[data-section="main"] .mtg-decklist-group', gs => gs.map(g => g.querySelector('h4').textContent + ': ' + [...g.querySelectorAll('li')].map(l => l.dataset.name).join(', ')));
    const want = ['Créatures (10): Monastery Swiftspear, Delver of Secrets, Kitchen Finks', 'Planeswalkers (1): Jace, the Mind Sculptor',
      'Éphémères (7): Lightning Bolt, Fire // Ice, Gut Shot', 'Terrains (20): Mountain', 'Autres (2): Foudre'];
    say(JSON.stringify(groups) === JSON.stringify(want), `main deck grouped by type, in French, unknown card in Autres: ${JSON.stringify(groups)}`);
    const costs = await p.$$eval('li[data-name]', ls => Object.fromEntries(ls.map(l => [l.dataset.name, [...l.querySelectorAll('.mtg-decklist-cost i')].map(i => i.className.replace('ms ms-cost ', '')).join(' ')])));
    say(costs['Lightning Bolt'] === 'ms-r' && costs['Delver of Secrets'] === 'ms-u' && costs['Fire // Ice'] === 'ms-1 ms-r' && costs['Kitchen Finks'] === 'ms-1 ms-gw ms-gw'
      && costs['Gut Shot'] === 'ms-rp' && costs['Jace, the Mind Sculptor'] === 'ms-2 ms-u ms-u' && costs.Mountain === '' && costs.Foudre === '' && costs.Duress === 'ms-b',
      `mana costs: front face, hybrid, Phyrexian, sideboard too: ${JSON.stringify(costs)}`);
    const label = await p.$eval('[data-section="main"] .mtg-decklist-cost', s => [s.getAttribute('role'), s.getAttribute('aria-label')]).catch(() => null);
    say(label && label[0] === 'img' && label[1] === '{R}', `cost readable by screen readers: ${label}`);
    const glyph = await p.$eval('.ms-cost.ms-r', i => [getComputedStyle(i).fontFamily, getComputedStyle(i, '::before').content]).catch(() => null);
    const font = await p.evaluate(() => document.fonts.check('1em Mana'));
    say(glyph && /Mana/.test(glyph[0]) && glyph[1] !== 'none' && font, `mana symbol drawn with the plugin's font: ${glyph}, loaded ${font}`);
    const curve = await p.$eval('.mtg-decklist-bars', b => b.getAttribute('aria-label')).catch(() => null);
    say(curve === 'Courbe de mana : 0 → 0, 1 → 13, 2 → 0, 3 → 2, 4 → 3, 5 → 0, 6 → 0, 7+ → 0', `mana curve without lands: ${curve}`);
    const side = await p.$$eval('[data-section="sideboard"] > ul > li', ls => ls.length);
    say(side === 1, `sideboard left as a list: ${side}`);
    await shot(p, 'deck');
    await p.hover('.mtg-decklist-group a[data-card="Kitchen Finks"]'); await p.waitForTimeout(300);
    const pop = await p.evaluate(() => { const q = document.querySelector('.scryfall-pop'); return !!q && !q.hidden && decodeURIComponent(q.querySelector('img').src); });
    say(pop && /Kitchen Finks/.test(pop), `tooltip on hover after the grouping: ${pop}`);
    await p.mouse.move(5, 5);
    await p.click('.mtg-decklist-copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    const btn = await p.textContent('.mtg-decklist-copy');
    say(clip.startsWith('Deck\n4 Lightning Bolt (M10) 146\n') && clip.endsWith('\n\nSideboard\n3 Duress (M20) 96') && btn === 'Liste copiée', `copy button: "${btn}", ${JSON.stringify(clip.slice(0, 40))}…`);
    say(!errs.length, `no JS error: ${errs}`);
    await c.close();
  }
  {
    const asked = [], c = await browser.newContext({ viewport: { width: 1000, height: 900 } }); await fake(c, asked);
    const p = await c.newPage(), errs = errors(p);
    await p.goto(base + '/commander', { waitUntil: 'networkidle' });
    await p.waitForSelector('.mtg-decklist-groups', { timeout: 5000 }).catch(() => {});
    say(JSON.stringify(asked) === JSON.stringify([['cmd/181', 'mom/298', 'plg20/2', 'xyz/999', 'Forest'], ['Duress']]),
      `by printing first, unknown printing asked again by name: ${JSON.stringify(asked)}`);
    const groups = await p.$$eval('[data-section="main"] .mtg-decklist-group', gs => gs.map(g => g.querySelector('h4').textContent + ': ' + [...g.querySelectorAll('li')].map(l => l.dataset.name).join(', ')));
    const want = ['Créatures (2): Etali, Primal Conqueror // Etali, Primal Sickness, Mechagodzilla, Battle Fortress', 'Rituels (1): Duress', 'Terrains (1): Forest'];
    say(JSON.stringify(groups) === JSON.stringify(want), `double-faced and flavor name grouped, nothing in Autres: ${JSON.stringify(groups)}`);
    const cmd = await p.$$eval('[data-section="commander"] > ul > li .mtg-decklist-cost i', is => is.map(i => i.className.replace('ms ms-cost ', '')).join(' '));
    say(cmd === 'ms-u ms-r ms-g', `commander: own section, not grouped, with its cost: ${cmd}`);
    const curve = await p.$eval('.mtg-decklist-bars', b => b.getAttribute('aria-label')).catch(() => null);
    say(curve === 'Courbe de mana : 0 → 1, 1 → 1, 2 → 0, 3 → 0, 4 → 0, 5 → 0, 6 → 0, 7+ → 1', `curve without the commander: ${curve}`);
    say(!errs.length, `no JS error: ${errs}`);
    await c.close();
  }
  {
    const asked = [], c = await browser.newContext({ viewport: { width: 1000, height: 900 } }); await fake(c, asked, true);
    const p = await c.newPage(), errs = errors(p);
    await p.goto(base + '/home', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    const st = await p.evaluate(() => [!!document.querySelector('.mtg-decklist-groups'), document.querySelectorAll('[data-section="main"] > ul > li').length, document.querySelectorAll('.mtg-decklist-cost').length]);
    say(asked.length === 1 && !st[0] && st[1] === 9 && !st[2] && !errs.length, `Scryfall down: server list unchanged (groups ${st[0]}, ${st[1]} lines, ${st[2]} costs), errors ${errs.length}`);
    await c.close();
  }
  {
    const asked = [], c = await browser.newContext({ javaScriptEnabled: false }); await fake(c, asked);
    const p = await c.newPage(); await p.goto(base + '/home');
    const txt = await p.locator('[data-section="main"]').innerText();
    const btn = await p.locator('.mtg-decklist-copy').count();
    say(asked.length === 0 && /Deck \(40\)/.test(txt) && /4\s+Lightning Bolt/.test(txt) && btn === 0, `without JS: readable list, no request, no button (${asked.length}, ${btn})`);
    await c.close();
  }
  {
    const asked = [], c = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, deviceScaleFactor: 2 }); await fake(c, asked);
    const p = await c.newPage(); await p.goto(base + '/home', { waitUntil: 'networkidle' });
    await p.waitForSelector('.mtg-decklist-groups', { timeout: 5000 }).catch(() => {});
    const wide = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await shot(p, 'phone');
    say(wide, `phone: no horizontal scroll`);
    await c.close();
  }
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
