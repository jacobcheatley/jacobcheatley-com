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
The decorative attachment that fixes a Note to the wall — a coloured pin (`pin-red`, `pin-green`, `pin-yellow`, `pin-blue`), cream masking tape (`tape-masking`) or clear tape (`tape-clear`), a single `staple` or two corner `staples`, a blob of sticky tack behind the Note (`stick`), or `none` (it holds on its own). Choosing a Fastener *is* the act of submitting the Note.
_Avoid_: pin (as the general term — a pin is one kind of Fastener)

**Curl**:
How much each of a Note's two bottom corners peels off the wall — a per-corner intensity (`bl`, `br`), seeded per Note and lightly adjustable. The renderer folds the corner up visually.
