<?php
namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\Shortcode as Sc;
use Thunder\Shortcode\Shortcode\ShortcodeInterface;

/**
 * [mtgdeck]…[/mtgdeck] around an Arena or MTGO export:
 *   Deck / Sideboard / Commander / Companion headers (Arena), or a blank line or "SB:" before the sideboard (MTGO);
 *   card lines "4 Lightning Bolt", "4x Lightning Bolt" or "4 Lightning Bolt (M10) 146".
 * [mtgdeck commander="Name"] moves that card from the main deck to the Commander section (exports without headers).
 * Rendered as sections of cards with their totals, readable without JS. Each name is a [scryfall] link, with the set
 * and collector number when the export gives them. Lines that are not a card or a header are left out.
 */
class DeckShortcode extends Shortcode
{
    private const SECTIONS = ['commander' => 'Commander', 'companion' => 'Companion', 'main' => 'Deck', 'sideboard' => 'Sideboard'];
    private const HEADERS = [
        'commander' => 'commander', 'companion' => 'companion', 'deck' => 'main', 'main' => 'main', 'mainboard' => 'main',
        'maindeck' => 'main', 'sideboard' => 'sideboard', 'side' => 'sideboard', 'about' => null,
    ];

    public function init()
    {
        $this->shortcode->getHandlers()->add('mtgdeck', function (ShortcodeInterface $sc) {
            $sections = self::parse((string) $sc->getContent());
            if (!$sections) {
                return $sc->getContent();
            }
            $commander = html_entity_decode(trim((string) $sc->getParameter('commander', '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            foreach ($commander !== '' ? $sections['main'] ?? [] : [] as $i => $c) {
                if (strcasecmp($c[1], $commander) === 0 || strcasecmp(explode(' // ', $c[1])[0], $commander) === 0) {
                    $sections['commander'][] = $c;
                    unset($sections['main'][$i]);
                }
            }
            $e = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $card = $this->shortcode->getHandlers()->get('scryfall');

            $html = '';
            $export = [];
            foreach (self::SECTIONS as $key => $label) {
                if (empty($sections[$key])) {
                    continue;
                }
                $total = 0;
                $items = '';
                $lines = [];
                foreach ($sections[$key] as [$qty, $name, $set, $number]) {
                    $total += $qty;
                    $params = $set ? ['set' => $set] + ($number ? ['number' => $number] : []) : [];
                    // Same markup as [scryfall] in an article; plain text when scryfall-tooltip is not there
                    $link = $card ? $card(new Sc('scryfall', $params, $name)) : $e($name);
                    // data-set and data-number: the script asks Scryfall for that printing (flavor names like Godzilla's)
                    $print = $set && $number ? ' data-set="' . $e($set) . '" data-number="' . $e($number) . '"' : '';
                    $items .= '<li data-name="' . $e($name) . '" data-qty="' . $qty . '"' . $print . '><span class="mtg-decklist-qty">' . $qty . '</span> ' . $link . '</li>';
                    $lines[] = "$qty $name" . ($set ? " ($set)" . ($number ? " $number" : '') : '');
                }
                $export[] = $label . "\n" . implode("\n", $lines);
                $html .= '<section class="mtg-decklist-section" data-section="' . $key . '"><h3>' . $label
                    . ' <span class="mtg-decklist-total">(' . $total . ')</span></h3><ul class="mtg-decklist-cards">' . $items . '</ul></section>';
            }

            $this->shortcode->addAssets('css', 'plugin://mtg-decklist/assets/mana.css');
            $this->shortcode->addAssets('css', 'plugin://mtg-decklist/assets/mtg-decklist.css');
            $this->shortcode->addAssets('js', ['plugin://mtg-decklist/assets/mtg-decklist.js', ['group' => 'bottom', 'loading' => 'defer']]);
            // data-list: the list in Arena format, for the "Copy the list" button
            return '<div class="mtg-decklist" data-list="' . $e(implode("\n\n", $export)) . '">' . $html . '</div>';
        });
    }

    /**
     * @return array<string, list<array{int, string, string, string}>> section => [quantity, name, set, number]
     */
    public static function parse(string $content): array
    {
        // The content has been through Markdown: paragraphs and line breaks back to lines, then plain text
        // (*F* came out of Markdown as <em>F</em>)
        $text = preg_replace(['~<br\s*/?>~i', '~</?p>~i', '~<em>([A-Z]+)</em>~'], ["\n", "\n", '*$1*'], $content);
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        $out = [];
        $section = 'main';
        $headers = false; // Arena headers seen: a blank line is then only a separator
        foreach (preg_split('/\R/u', $text) as $line) {
            $line = trim($line);
            if ($line === '') {
                if (!$headers && $section === 'main' && !empty($out['main'])) {
                    $section = 'sideboard'; // MTGO: the sideboard follows the first blank line
                }
                continue;
            }
            $word = strtolower(rtrim($line, ': '));
            if (array_key_exists($word, self::HEADERS)) {
                $section = self::HEADERS[$word];
                $headers = true;
                continue;
            }
            if ($section === null || !preg_match('/^(SB:\s*)?(\d{1,3})x?\s+(.+)$/iu', $line, $m) || (int) $m[2] < 1) {
                continue; // "About" block of Arena ("Name …"), or not a card line
            }
            $name = preg_replace('/\s+\*[A-Z]+\*$/', '', $m[3]); // Moxfield's *F* (foil) and *E* (etched)
            $set = $number = '';
            if (preg_match('/^(.+?)\s+\(([A-Za-z0-9]{2,8})\)(?:\s+([\p{L}\p{N}★†-]{1,12}))?$/u', $name, $p)) {
                [$name, $set, $number] = [$p[1], $p[2], $p[3] ?? '']; // as exported; [scryfall] lowercases the set
            }
            $name = preg_replace('~\s+/\s+~', ' // ', trim($name)); // Moxfield's "Front / Back" → Scryfall's "Front // Back"
            $out[$m[1] !== '' ? 'sideboard' : $section][] = [(int) $m[2], $name, $set, $number];
        }

        return $out;
    }
}
