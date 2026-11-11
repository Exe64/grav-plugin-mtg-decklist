<?php
namespace Grav\Plugin;

use Grav\Common\Plugin;

/**
 * [mtgdeck]…[/mtgdeck]: an Arena or MTGO export pasted in a page becomes a deck list, each card a [scryfall] link
 * from scryfall-tooltip. In the browser, assets/mtg-decklist.js groups the main deck by card type, with mana costs
 * and the mana curve, from Scryfall.
 */
class MtgDecklistPlugin extends Plugin
{
    public static function getSubscribedEvents(): array
    {
        return ['onShortcodeHandlers' => ['onShortcodeHandlers', 0]];
    }

    public function onShortcodeHandlers(): void
    {
        $this->grav['shortcode']->registerAllShortcodes(__DIR__ . '/shortcodes');
    }
}
