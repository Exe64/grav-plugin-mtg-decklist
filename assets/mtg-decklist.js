// MTG Decklist: asks Scryfall (/cards/collection) for the types and mana costs of the cards on the page, then groups
// the main deck by card type, adds the mana costs and the mana curve, and a "Copy the list" button.
// Without JS, or when Scryfall does not answer, the sections rendered by the server stay as they are.
(function () {
  var decks = document.querySelectorAll('.mtg-decklist');
  if (!decks.length) return;
  var fr = (document.documentElement.lang || '').slice(0, 2) === 'fr';
  var T = fr
    ? { copy: 'Copier la liste', copied: 'Liste copiée', curve: 'Courbe de mana', cards: 'cartes',
        groups: ['Créatures', 'Planeswalkers', 'Batailles', 'Éphémères', 'Rituels', 'Artefacts', 'Enchantements', 'Terrains', 'Autres'] }
    : { copy: 'Copy the list', copied: 'List copied', curve: 'Mana curve', cards: 'cards',
        groups: ['Creatures', 'Planeswalkers', 'Battles', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands', 'Other'] };
  // Display order of T.groups; a card goes in the first type of its front face found in TYPES (land first: Dryad Arbor)
  var ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'];
  var TYPES = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  decks.forEach(function (deck) {
    if (!navigator.clipboard || !deck.dataset.list) return;
    var b = el('button', 'mtg-decklist-copy', T.copy);
    b.type = 'button';
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(deck.dataset.list).then(function () {
        b.textContent = T.copied;
        setTimeout(function () { b.textContent = T.copy; }, 2000);
      });
    });
    deck.insertBefore(b, deck.firstChild);
  });

  // Scryfall knows a split card by its first half ("Fire", not "Fire // Ice") and a double-faced one by its front face
  var key = function (name) { return name.split(' // ')[0].trim().toLowerCase(); };
  // A printing from the export (set and number) is asked as such: it finds flavor names ("Mechagodzilla, Battle Fortress")
  var pkey = function (set, number) { return 'p:' + set.toLowerCase() + '/' + number.toLowerCase(); };
  var lis = [].slice.call(document.querySelectorAll('.mtg-decklist li[data-name]'));
  var found = {}, asked = {}, got = false;
  var lookup = function (li) {
    return (li.dataset.set && found[pkey(li.dataset.set, li.dataset.number)]) || found[key(li.dataset.name)];
  };
  // Identifiers of the cards still unknown: their printing first, their name next (an Arena set code Scryfall lacks)
  function ids(byPrinting) {
    var out = {};
    lis.forEach(function (li) {
      if (lookup(li)) return;
      var p = byPrinting && li.dataset.set && pkey(li.dataset.set, li.dataset.number), k = p || key(li.dataset.name);
      if (asked[k]) return;
      out[k] = p ? { set: li.dataset.set.toLowerCase(), collector_number: li.dataset.number } : { name: li.dataset.name.split(' // ')[0].trim() };
    });
    return Object.keys(out).map(function (k) { asked[k] = true; return out[k]; });
  }
  // Up to 75 identifiers per request, one request after another (Scryfall asks for 50 to 100 ms between them)
  function ask(list, done) {
    (function next(i) {
      if (i >= list.length) return done();
      fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifiers: list.slice(i, i + 75) })
      }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }).then(function (d) {
        got = true;
        (d.data || []).forEach(function (c) {
          var face = (c.card_faces && c.card_faces[0]) || c;
          var card = { type: face.type_line || c.type_line || '', cost: face.mana_cost || c.mana_cost || '', cmc: c.cmc || 0 };
          found[key(c.name)] = card;
          if (face.name) found[key(face.name)] = card;
          if (c.set && c.collector_number) found[pkey(c.set, c.collector_number)] = card;
        });
        setTimeout(function () { next(i + 75); }, 100);
      }).catch(function () { if (got) render(); }); // nothing answered yet: nothing changes
    })(0);
  }
  ask(ids(true), function () { var rest = ids(false); rest.length ? ask(rest, render) : render(); });

  // {2}{W/U}{G/P} → mana font symbols, with the cost as text for screen readers
  function cost(text) {
    var s = el('span', 'mtg-decklist-cost');
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', text);
    s.title = text;
    (text.match(/\{[^}]+\}/g) || []).forEach(function (sym) {
      var i = el('i', 'ms ms-cost ms-' + sym.slice(1, -1).toLowerCase().replace(/\//g, ''));
      i.setAttribute('aria-hidden', 'true');
      s.appendChild(i);
    });
    return s;
  }

  function render() {
    decks.forEach(function (deck) {
      deck.querySelectorAll('li[data-name]').forEach(function (li) {
        var c = lookup(li);
        if (c && c.cost) li.appendChild(cost(c.cost));
      });
      var main = deck.querySelector('[data-section="main"]');
      if (!main) return;
      var ul = main.querySelector('ul');
      var groups = T.groups.map(function () { return []; }), curve = [0, 0, 0, 0, 0, 0, 0, 0];
      ul.querySelectorAll('li').forEach(function (li) {
        var c = lookup(li), t = c ? TYPES.filter(function (x) { return c.type.split(' — ')[0].indexOf(x) > -1; })[0] : null;
        var g = t ? ORDER.indexOf(t) : groups.length - 1;
        groups[g].push(li);
        if (c && t !== 'Land') curve[Math.min(7, Math.floor(c.cmc))] += +li.dataset.qty;
      });
      var box = el('div', 'mtg-decklist-groups');
      groups.forEach(function (lis, g) {
        if (!lis.length) return;
        var div = el('div', 'mtg-decklist-group'), h = el('h4', null, T.groups[g] + ' ');
        var n = lis.reduce(function (s, li) { return s + +li.dataset.qty; }, 0);
        h.appendChild(el('span', 'mtg-decklist-total', '(' + n + ')'));
        var list = el('ul', 'mtg-decklist-cards');
        lis.forEach(function (li) { list.appendChild(li); }); // moved, not copied: the tooltip listeners stay
        div.appendChild(h); div.appendChild(list); box.appendChild(div);
      });
      ul.replaceWith(box);
      var max = Math.max.apply(null, curve);
      if (!max) return;
      var fig = el('figure', 'mtg-decklist-curve');
      fig.appendChild(el('figcaption', null, T.curve));
      var bars = el('div', 'mtg-decklist-bars');
      bars.setAttribute('role', 'img');
      bars.setAttribute('aria-label', T.curve + ' : ' + curve.map(function (n, v) { return (v === 7 ? '7+' : v) + ' → ' + n; }).join(', '));
      curve.forEach(function (n, v) {
        var bar = el('div', 'mtg-decklist-bar');
        bar.style.setProperty('--h', n / max);
        bar.title = n + ' ' + T.cards;
        bar.appendChild(el('span', 'mtg-decklist-n', n || ''));
        bar.appendChild(el('span', 'mtg-decklist-v', v === 7 ? '7+' : String(v)));
        bars.appendChild(bar);
      });
      fig.appendChild(bars);
      main.appendChild(fig);
    });
  }
})();
