# jacobcheatley.com

Personal website: a landing page about the owner, and a collection of self-contained projects, some hosted here (quizzes, games, ARGs, browser toys, small utilities) and some showcased from elsewhere.

## Language

**Project**:
A self-contained piece of work presented on the site at its own flat URL, whether it runs here (a quiz, game, ARG, browser toy or utility) or is external work showcased with a page. Every Project gets the same treatment regardless of how serious or playful it is.
_Avoid_: toy, experiment, tool, mini-app, thing

**Portfolio**:
The landing page and pages that present the owner and point at their Projects.
_Avoid_: about page, showcase, homepage

**Cover**:
The piece of artwork that stands for a Project on the Portfolio: the Project's name baked in, styled as the Project itself. It is the only thing the Portfolio shows of a Project, and the only place bold colour appears there.
_Avoid_: card, thumbnail, tile

### Sticky Notes

The diegetic note-wall Project (`/sticky-notes`). A submitted **Note**'s visual content is a versioned JSON blob; its **author** and timestamps are separate storage, not part of that blob.

**Note**:
One sticky note. Its content is a versioned JSON blob — note-level cosmetics (colour, rotation, curl, fastener) plus an ordered list of **Elements** — laid out in a fixed note-local coordinate space whose dimensions travel with the note. Stays *pending* until approved; only approved Notes reach the wall.
_Avoid_: card, post, message, sticky (bare)

**Element**:
One item placed on a Note — a **Stroke**, **Text box**, or **Sticker**. Elements are an ordered list; that order *is* the z-order (later element draws on top). No stable id — position in the list is identity.
_Avoid_: object, shape, item, layer, select, edit, resize

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
The decorative attachment that fixes a Note to the wall — a coloured pin (`pin-red`, `pin-green`, `pin-yellow`, `pin-blue`), cream masking tape (`tape-masking`) or clear tape (`tape-clear`), a single `staple` or two corner `staples`, a blob of sticky tack behind the Note (`stick`), or `none` (it holds on its own). Chosen from the row of all nine laid beneath the Note in the **Spotlight**; signing the **Tag**, not choosing a Fastener, is what submits the Note.
_Avoid_: pin (as the general term — a pin is one kind of Fastener), drawer

**Curl**:
How much each of a Note's two bottom corners peels off the wall — a per-corner intensity (`bl`, `br`), seeded per Note and lightly adjustable. The renderer folds the corner up visually.

**Mat**:
The cutting mat a Note is made on: a full-screen desk that slides up over the wall (`/sticky-notes/new`) and back down. Everything a Note is made with lies on it, and the Note on it is bare paper — no Fastener until it is pinned up.
_Avoid_: editor page, modal, canvas

**Tray**:
The centred row along the Mat's bottom edge where the objects lie, in this order: the **Hand**, the four **Markers**, the draw/write rocker, the **Sticker sheet**'s tab, the **Eraser**, and the bin. It is away while a **Pad** is being chosen.
_Avoid_: toolbar, palette

**Pad**:
One of six pads of sticky notes, one per paper colour, that fill the whole Mat whenever there is no Note on it — the pad chooser, on first opening, after the bin and after a Note is sent. They lie in one to three columns of overlapping stacks, each pad a little askew. Tapping a Pad tears a sheet off it to start a Note. The paper colour is fixed once torn; the bin is the way back to the Pads for another.
_Avoid_: swatch, colour picker

**Marker**:
One of four pens on the Tray, one per **Ink**. The Marker *is* the colour: picking one up is how an Ink is chosen, and there are no swatches. One fixed nib: a **Stroke** is the same width however hard it is pressed.
_Avoid_: pen, brush, colour swatch

**Eraser**:
The rubber on the Tray. Held and rubbed across the Note, it removes each whole **Element** under it. It is the only delete: there is no undo, and an Element can't be dragged off the paper.
_Avoid_: delete button

**Hand**:
The open hand lying on the Tray: the tool held whenever no **Marker** and not the **Eraser** is. Putting any other tool down picks it up. It is an object on the Tray like the rest, not the tool a Note starts with — tearing a sheet off a **Pad** puts the black Marker in hand.

**Hand mode**:
Holding the **Hand**. A drag on the Note turns it about its centre and its bottom corners set its **Curl** — nothing else: it never takes hold of an **Element**.
_Avoid_: tweezers, select tool, pointer

**Draw mode**:
Using the held Marker to draw: a drag on the Note leaves a **Stroke** in that Marker's Ink.

**Write mode**:
Using the held Marker to write: a tap on the Note opens a **Text box** in that Marker's Ink and the chosen font. The font can be chosen before or while **Placing**, never after; the Ink is the Text box's for good.

**Placing**:
The time between an **Element** landing on the Note and the tap away that fixes it. While Placing, a **Text box** or **Sticker** can be moved and turned, and a Text box widened; afterwards it never changes, and the **Eraser** is the only way to remove it.

**Sticker sheet**:
A sheet of printed emoji that rises over the **Tray** and covers it, leaving the Tray dim and out of reach beneath. While it is up the sheet is what is held: nothing acts on the Note but **Placing** the peeled **Sticker**. A Sticker is peeled off it and dragged onto the Note; the sheet never runs out. It goes away at its folded corner, with a swipe down or with Escape, handing back whatever was held before; its tab stays in the Tray.
_Avoid_: emoji picker

**Tag**:
The paper name tag hanging under a Note held in the **Spotlight** to be pinned up, below the row of **Fasteners**. Writing a name on it and signing it (Enter, or its tick) submits the Note — its one write — with that name, lowercased, as the **author**.
_Avoid_: author field, form, submit button

**Spotlight**:
The wall darkened with one Note lifted out of it, straight and large. Zooming in on an approved Note is a Spotlight; pinning a new one up is a Spotlight with the nine **Fasteners** laid in a row beneath the Note, the **Tag** below those, and the way back to the desk taped above it.
_Avoid_: lightbox, landing, preview, modal

### Blog

The Project where the owner's writing lives (`/blog`). It is a Project with a **Cover** like any other, but it is the one Project that shares the **Portfolio**'s design instead of bringing its own.

**Article**:
One piece of writing on the Blog, at its own URL under it (`/blog/<slug>`). Written in Markdown.
_Avoid_: post, entry

**Tagline**:
The one-line summary shown with an **Article** wherever Articles are listed.
_Avoid_: description, excerpt, summary

**Topic**:
A label shared across **Articles**, shown with each one it is on. An Article may have several.
_Avoid_: tag (a **Tag** is the Sticky Notes name tag), category

**Publish date**:
The moment an **Article** becomes public, and the date shown with it. An Article with none is a **Draft**; with one still in the future it is **Scheduled**; once it has arrived it is **Published**. Only Published Articles are visible on the site.
_Avoid_: status, published flag

### Elemental Showdown

The crowd-voted Project (`/elemental-showdown`). Visitors vote on head-to-heads between **Elements**; the votes add up to the public **Stats**.

**Element**:
One of the owner-seeded contenders — fire, water, plant and so on — each with an emoji and a colour. The name and emoji identify it; the colour is thematic and need not be unique. Not the Sticky Notes **Element**; the two never meet.
_Avoid_: type

**Common**, **Rare**:
The two kinds of **Element**. A Common one is a staple everyone has an opinion on (fire, water, rock); a Rare one is further afield (magnet, paper, frog). A voter's first five **Matchups** are between two Common Elements; after that the kind changes nothing.
_Avoid_: tier, core, starter

**Active**:
An **Element** the owner currently has switched on. One that is not Active is never offered in a **Matchup** and does not appear in the **Stats**, but its **Votes** are kept and return with it: a seasonal Element (santa, the easter bunny) is a Rare one that is Active for part of the year. A Matchup is Active when both its Elements are.
_Avoid_: enabled, retired, deleted, seasonal (not a kind)

**Matchup**:
An unordered pair of two different **Elements**. It is what a voter is shown and what a **Vote** is about.
_Avoid_: pair, battle, duel

**Vote**:
One **Voter**'s verdict on one **Matchup**: one side wins strongly, one side wins weakly, or too close to call.
_Avoid_: rating, answer, swipe

**Voter**:
A browser that has cast at least one **Vote**. Not a person: a cleared cookie or a second device is a new Voter.
_Avoid_: user, account, visitor (a visitor becomes a Voter on their first Vote)

**Stats**:
The only public view of the votes as a whole: **Stories** about the crowd's calls, then a page per **Element** listing its **Effectiveness** against every other, each shown with its **Confidence**. A **Voter** sees the Stats once there are enough Votes overall and they have cast enough of their own. There is no grid of every Matchup.
_Avoid_: chart, type chart, table, results

**Story**:
One headline in the **Stats**, drawn from the crowd's calls: the champion, the punching bag, the most **Controversial** Matchup, a rock-paper-scissors triangle, the Voter's own record against the crowd.
_Avoid_: headline, card, fun fact

**Effectiveness**:
The crowd's call on one **Matchup**, read from one Element's side: 4×, 2×, **Neutral**, **Controversial**, ½× or ¼×. What one Element reads as 2×, the other reads as ½×.
_Avoid_: tier, verdict, result

**Neutral**, **Controversial**:
The two **Effectiveness** values with no winner. Neutral: the crowd agrees neither side wins. Controversial: the crowd is split between the two sides, not indifferent.
_Avoid_: tie, draw, mixed

**Confidence**:
How sure the crowd is of a Matchup's **Effectiveness**, given how many **Votes** it has and how much they agree: solid, medium or faint.
_Avoid_: boldness, certainty, strength
