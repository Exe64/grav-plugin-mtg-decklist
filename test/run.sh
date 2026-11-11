#!/usr/bin/env bash
# Bench of the plugin: a throwaway Grav (French site) with shortcode-core, scryfall-tooltip, the plugin and test/pages,
# then markup checks and, when Playwright is available, the browser checks (test/browser.js, Scryfall answered locally).
# Needs php 8.3 (gd, zip), curl, unzip, node.
# Usage, from the repository root: bash test/run.sh [screenshot-dir]
# GRAV_ZIP: a local Grav archive instead of the download. HOLD=<seconds>: keep the server up that long after the markup checks, for a browser run from elsewhere.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SHOTS="${1:-}"
PORT="${PORT:-8099}"
W="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$W"' EXIT
if [[ -z "${GRAV_ZIP:-}" ]]; then GRAV_ZIP="$W/grav.zip"; curl -fsSL -o "$GRAV_ZIP" https://getgrav.org/download/core/grav/latest || { echo "Grav download failed"; exit 1; }; fi
cd "$W" && unzip -q "$GRAV_ZIP" && cd "$(ls -d "$W"/grav*/ | head -1)" || exit 1
# A grav-admin archive (local cache) would redirect to the admin setup: keep the plain Grav
rm -rf user/plugins/{admin,admin2,login,form,email,flex-objects,api,problems} 2>/dev/null
for p in shortcode-core scryfall-tooltip feed; do
  for i in 1 2 3; do php bin/gpm install -y "$p" >/dev/null; [[ -d user/plugins/$p ]] && break; sleep 5; done
  [[ -d user/plugins/$p ]] || { echo "$p not installed"; exit 1; }
done
mkdir user/plugins/mtg-decklist && cp -r "$REPO"/{mtg-decklist.php,mtg-decklist.yaml,blueprints.yaml,assets,shortcodes} user/plugins/mtg-decklist/
rm -rf user/pages/* && cp -r "$REPO"/test/pages/. user/pages/
printf 'title: Test\ndefault_lang: fr\n' > user/config/site.yaml
mkdir -p user/config/plugins && printf 'enabled: true\nenable_json_feed: true\n' > user/config/plugins/feed.yaml
php -S 127.0.0.1:"$PORT" system/router.php >"$W/php.log" 2>&1 &
B="http://127.0.0.1:$PORT"
for i in $(seq 30); do curl -fs -o /dev/null "$B/" && break; sleep 1; done

fail=0
ok() { echo "ok   $*"; }
ko() { echo "FAIL $*"; fail=$((fail+1)); }
get() { curl -s -o "$W/page.html" -w '%{http_code}' "$B$1"; }
has() { grep -qF -- "$1" "$W/page.html"; }
# Across lines: newlines are kept in attributes
hasz() { tr '\n' '\r' <"$W/page.html" | grep -qF -- "$(printf '%s' "$1" | tr '\n' '\r')"; }
count() { grep -oF -- "$1" "$W/page.html" | wc -l; }

echo "== markup"
get /home >/dev/null
has '<section class="mtg-decklist-section" data-section="main"><h3>Deck <span class="mtg-decklist-total">(40)</span></h3>' && ok "Arena: main deck and its total" || ko "main section: $(grep -o '<section[^>]*data-section="main"><h3>[^/]*' "$W/page.html")"
has 'data-section="sideboard"><h3>Sideboard <span class="mtg-decklist-total">(3)</span>' && ok "Arena: sideboard and its total" || ko "sideboard section"
[[ $(count '<li data-name=') == 10 ]] && ok "10 card lines, About block left out" || ko "card lines: $(count '<li data-name=')"
has '<li data-name="Lightning Bolt" data-qty="4"><span class="mtg-decklist-qty">4</span> <a class="scryfall-card" href="https://scryfall.com/search?q=%21%22Lightning%20Bolt%22%20set%3Am10%20cn%3A146" data-card="Lightning Bolt" data-img="https://api.scryfall.com/cards/m10/146?format=image&amp;version=normal">Lightning Bolt</a></li>' && ok "card line: quantity and [scryfall] link with set and number" || ko "card line: $(grep -o '<li data-name="Lightning Bolt"[^/]*' "$W/page.html")"
has 'data-card="Monastery Swiftspear" data-img="https://api.scryfall.com/cards/named?format=image&amp;version=normal&amp;fuzzy=Monastery%20Swiftspear"' && ok "card without set: image by name" || ko "name only"
has '<li data-name="Gut Shot" data-qty="1">' && ok "foil marker *F* removed" || ko "foil marker"
has 'data-name="Fire // Ice"' && has 'data-name="Foudre"' && ok "split card and French name kept" || ko "split / French"
hasz $'data-list="Deck\n4 Lightning Bolt (M10) 146\n4 Monastery Swiftspear\n4 Delver of Secrets\n2 Fire // Ice\n2 Kitchen Finks\n1 Gut Shot\n' && ok "data-list: the list in Arena format" || ko "data-list: $(grep -o 'data-list="[^"]\{0,80\}' "$W/page.html")"
hasz $'20 Mountain\n\nSideboard\n3 Duress (M20) 96">' && ok "data-list: sideboard after a blank line" || ko "data-list sideboard"
has 'Name Burn' && ko "About block shown" || ok "About block not shown"
has 'mtg-decklist.js' && has 'mtg-decklist.css' && has 'mtg-decklist/assets/mana.css' && has 'scryfall-tooltip.js' && ok "assets of both plugins on a page with a deck" || ko "assets missing"
get /home >/dev/null
has 'mtg-decklist.js' && has 'scryfall-tooltip.js' && ok "assets on the cached page too" || ko "assets missing from cache"

get /mtgo >/dev/null
has 'data-section="main"><h3>Deck <span class="mtg-decklist-total">(9)</span>' && ok "MTGO: main deck, 4x accepted" || ko "MTGO main: $(grep -o 'data-section="main"><h3>[^/]*' "$W/page.html")"
has 'data-section="sideboard"><h3>Sideboard <span class="mtg-decklist-total">(3)</span>' && ok "MTGO: sideboard after the blank line, plus the SB: line" || ko "MTGO sideboard"
has "data-name=\"Kongming, &quot;Sleeping Dragon&quot;\"" && has 'data-name="Æther Vial"' && ok "quotes escaped, entity decoded once" || ko "escaping: $(grep -o 'data-name="[^"]*' "$W/page.html" | head -5 | tr '\n' ' ')"
has 'onerror' && ko "HTML in a card line kept" || ok "HTML in a card line removed"
has 'Not a deck at all.' && [[ $(count 'class="mtg-decklist"') == 1 ]] && ok "[mtgdeck] without a card line: content left as is" || ko "empty deck"
get /plain >/dev/null
has 'mtg-decklist' && ko "assets on a page without deck" || ok "no assets on a page without deck"
has '[deck]1 Opt[/deck]' && ok "[deck] not handled: generic name left to others" || ko "[deck] handled"

echo "== summaries and feeds"
get /blog >/dev/null
has 'data-name="Lightning Bolt"' && has 'Text after the deck' && ok "blog list: summary with the deck and the text after it" || ko "blog list: $(grep -c 'data-name=' "$W/page.html") card line(s), text after $(grep -c 'Text after the deck' "$W/page.html")"
for f in rss atom json; do
  code=$(get /blog.$f)
  if [[ $f == json ]]; then php -r 'exit(json_decode(file_get_contents($argv[1])) === null ? 1 : 0);' "$W/page.html"; else php -r 'exit(simplexml_load_file($argv[1]) === false ? 1 : 0);' "$W/page.html" 2>/dev/null; fi; valid=$?
  [[ $code == 200 && $valid == 0 ]] && has 'Lightning Bolt' && has 'Text after the deck' && ok "$f feed: valid, deck and text kept" || ko "$f feed: $code, valid=$valid"
done
for f in mtg-decklist.js mtg-decklist.css mana.css fonts/mana.woff2; do code=$(curl -s -o /dev/null -w '%{http_code}' "$B/user/plugins/mtg-decklist/assets/$f"); [[ $code == 200 ]] || ko "asset $f $code"; done; ok "plugin assets served"
grep -qiE 'fatal|exception' "$W/php.log" && ko "PHP errors: $(grep -iE 'fatal|exception' "$W/php.log" | head -2)" || ok "no PHP error in the log"

echo "== browser"
if [[ -n "${HOLD:-}" ]]; then echo "ready $B"; sleep "$HOLD"; elif command -v node >/dev/null && (cd "$REPO" && node -e "require('playwright-core')") 2>/dev/null; then
  node "$REPO/test/browser.js" "$B" "$REPO/test/card.jpg" ${SHOTS:+"$SHOTS"} || fail=$((fail+1))
else ko "playwright-core not found (npm i --no-save playwright-core && npx playwright-core install chromium)"; fi
[[ $fail == 0 ]] && echo "ALL OK" || { echo "$fail FAILED"; exit 1; }
