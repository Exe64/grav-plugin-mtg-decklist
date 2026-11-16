# v1.2.0
## 2026-11-16

1. [](#new)
    * `scryfall_lookup` setting: off, no request to Scryfall on page load (sites with strict privacy rules)
1. [](#improved)
    * Commander, Companion, Deck and Sideboard headings translated (`languages.yaml`, English and French): a French page no longer mixes both
1. [](#bugfix)
    * `docs/` left out of the GPM zip (`.gitattributes` named `/doc`)

# v1.1.0
## 2026-11-14

1. [](#new)
    * `[mtgdeck commander="Name"]`: the commander of an export without headers (Moxfield) gets its own section
1. [](#improved)
    * Cards asked to Scryfall by printing when the export gives set and number: flavor names are grouped (Godzilla series), an unknown printing is asked again by name
1. [](#bugfix)
    * A double-faced card written `Front / Back` (Moxfield) was in "Other": now read as `Front // Back`

# v1.0.0
## 2026-11-11

1. [](#new)
    * `[mtgdeck]…[/mtgdeck]`: an Arena or MTGO export becomes a deck list, each card a Scryfall Tooltip link
    * Main deck grouped by card type, mana costs and mana curve from Scryfall, "Copy the list" button
    * Mana symbols shipped with the plugin (Mana font, SIL OFL 1.1)
