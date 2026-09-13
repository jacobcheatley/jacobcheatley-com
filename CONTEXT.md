# jacobcheatley.com

Personal website: a landing page about the owner, and a collection of self-contained projects, some hosted here (quizzes, games, ARGs, browser toys, small utilities) and some showcased from elsewhere.

## Language

**Project**:
A self-contained piece of work presented on the site at its own flat URL, whether it runs here (a quiz, game, ARG, browser toy or utility) or is external work showcased with a page. Every Project gets the same treatment regardless of how serious or playful it is.
_Avoid_: toy, experiment, tool, mini-app, thing

**Portfolio**:
The landing page and pages that present the owner and point at their Projects.
_Avoid_: about page, showcase, homepage

### Sticky Notes

The diegetic note-wall Project (`/sticky-notes`). A submitted **Note**'s visual content is a versioned JSON blob; its **author** and timestamps are separate storage, not part of that blob.

**Note**:
One sticky note. Its content is a versioned JSON blob — note-level cosmetics (colour, rotation, curl, fastener) plus an ordered list of **Elements** — laid out in a fixed note-local coordinate space whose dimensions travel with the note. Stays *pending* until approved; only approved Notes reach the wall.
_Avoid_: card, post, message, sticky (bare)

**Element**:
One item placed on a Note — a **Stroke**, **Text box**, or **Sticker**. Elements are an ordered list; that order *is* the z-order (later element draws on top). No stable id — position in the list is identity.
_Avoid_: object, shape, item, layer

**Stroke**:
A freehand marker mark on a Note. Stores the raw input points the pointer produced, not the rendered outline (the outline is regenerated at render time), plus its **Ink** and a base size.

**Text box**:
A positioned, fixed-width block of typed text on a Note, with a font, an **Ink** colour, a size, and a rotation. Text wraps within its stored width.
_Avoid_: label, caption, text (bare)

**Sticker**:
A positioned emoji on a Note, with a scale and a rotation.

**Ink**:
The marker colour palette — `black`, `green`, `red`, `blue`. The only colours a **Stroke** or **Text box** may use. Named, not raw colour values; the actual shade is a render-time detail.
_Avoid_: colour (for strokes/text — "colour" alone is the Note's background)

**Fastener**:
The decorative attachment that fixes a Note to the wall — a coloured pin (`pin-red`, `pin-green`, `pin-yellow`, `pin-blue`), cream masking tape (`tape-masking`) or clear tape (`tape-clear`), a single `staple` or two corner `staples`, a blob of sticky tack behind the Note (`stick`), or `none` (it holds on its own). Chosen from the **Fastener drawer** once the Note is pinned up; signing the **Tag**, not choosing a Fastener, is what submits the Note.
_Avoid_: pin (as the general term — a pin is one kind of Fastener)

**Curl**:
How much each of a Note's two bottom corners peels off the wall — a per-corner intensity (`bl`, `br`), seeded per Note and lightly adjustable. The renderer folds the corner up visually.

**Mat**:
The cutting mat a Note is made on: a full-screen desk that slides up over the wall (`/sticky-notes/new`) and back down. Everything a Note is made with lies on it, and the Note on it is bare paper — no Fastener until it is pinned up.
_Avoid_: editor page, modal, canvas

**Tray**:
The single row along the Mat's bottom edge where the objects lie, each in a fixed slot of its own — the **Pads** at the left, the **Markers** in the middle, the **Sticker sheet**'s tab, the **Eraser** and the bin at the right.
_Avoid_: toolbar, palette

**Pad**:
One of six stacked pads of sticky notes on the Tray, one per paper colour. The first tap fans the stack out; tapping a Pad then tears a fresh sheet off it to start a Note, or, with a Note already on the Mat, swaps the paper under it.
_Avoid_: swatch, colour picker

**Marker**:
One of four pens on the Tray, one per **Ink**. The Marker *is* the colour: picking one up is how an Ink is chosen, and there are no swatches. One fixed nib.
_Avoid_: pen, brush, colour swatch

**Eraser**:
The rubber on the Tray. Held and rubbed across the Note, it removes each whole **Element** under it. There is no undo; the Eraser and dragging an Element off the paper are the only deletes.
_Avoid_: delete button

**Hand mode**:
Holding nothing. A tap selects an **Element** (tapping the same spot again reaches the one beneath), a drag moves it, and its handle scales and turns it; the Note's edge turns the Note and its bottom corners set its **Curl**.
_Avoid_: tweezers, select tool, pointer

**Draw mode**:
Using the held Marker to draw: a drag on the Note leaves a **Stroke** in that Marker's Ink.

**Write mode**:
Using the held Marker to write: a tap on the Note opens a **Text box** in that Marker's Ink and the chosen font. The Text box keeps that Ink for good; its font can change.

**Sticker sheet**:
A sheet of printed emoji that pulls up from its tab on the Tray. A **Sticker** is peeled off it and dragged onto the Note; the sheet never runs out.
_Avoid_: emoji picker

**Fastener drawer**:
The box of the nine **Fasteners** that rises over the wall once a Note is pinned up, each shown as it will look on that Note. Choosing one presses it on, and the drawer folds to a tab that opens it again until the Tag is signed. Put away without a choice, the Note keeps `none`.

**Tag**:
The paper name tag hanging under a Note pinned up on the wall. Writing a name on it and signing it (Enter, or its tick) submits the Note — its one write — with that name, lowercased, as the **author**.
_Avoid_: author field, form, submit button
