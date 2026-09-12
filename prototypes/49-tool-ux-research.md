# Tool-selection UX for a diegetic sticky-note editor (#49)

Research pass on how touch/mobile creative apps present their **tool palette** so it stays
tactile, works one-handed, and degrades gracefully on a phone. Scoped to our case: 4 marker
inks (black/green/red/blue), freely-placed text boxes, peel-off emoji stickers, and a "stick
it to the corkboard" submit. **No undo** by design.

Primary sources are marked (P) in the Sources list.

---

## 1. Named tool-selection patterns for touch

### A. Physical-object palette / tool tray
- **What:** Tools rendered as the real objects they are (markers in a tray, a sticker sheet,
  a tape roll). You pick one up; the picked-up one visibly lifts/tilts. Selecting the object
  *is* selecting the tool — no separate icon.
- **Exemplars:** Paper (WeTransfer) — a compact tool tray you swipe down to dismiss and swipe
  up to recall; Procreate's pen/eraser/smudge as distinct top-corner tools; GoodNotes/Notability
  pen "tray" where the pen carries its own colour+width.
- **Our case:** Best fit for the concept. Four markers laid in a tray, colour *is* the marker
  (pick-up-to-set-colour), a sticker sheet you peel from, a corkboard target for submit. The
  charm and the mechanic are the same object.
- **Compression:** Tray is a horizontal row — see pattern B for how it shrinks. Markers are
  fat targets; four of them fit a phone easily. Stickers/text/tape can collapse into the tray
  as "drawers" rather than always-visible.

### B. Horizontally-scrollable dock (bottom)
- **What:** A single bottom row of tools; overflow scrolls sideways or spills into a "+/more".
- **Exemplars:** GoodNotes and Notability bottom toolbars (pen, highlighter, eraser, shapes,
  lasso, text; extras behind a `+`); FigJam's bottom toolbar (sticky = S, stamp = E, stickers tab).
- **Our case:** Natural home for the marker tray + text + sticker + submit. Sits in the thumb
  zone. Risk: a plain scrollable icon row reads as "generic flat buttons" — the thing we're
  avoiding. Mitigate by making the row *look like a physical tray/desk edge*, not a chrome bar.
- **Compression:** Show the 4 markers + 1 or 2 mode buttons (text, sticker); everything else
  is a drawer/sheet. Overflow via horizontal scroll is a last resort — prefer collapsing.

### C. Radial / wheel menu
- **What:** Tools arranged in a ring around a fixed point (or invoked at touch point). Muscle
  memory + fat targets; no screen edge needed.
- **Exemplars:** Concepts "Tool Wheel" (8 outer tool slots, inner ring = size/opacity/smoothing,
  centre = colour) — draggable, or swappable for a linear tool bar; Procreate Pocket **QuickMenu**
  (6 customisable buttons, double-tap canvas to invoke, press-hold to remap).
- **Our case:** Strong for one-handed use and it feels like a "palette in hand". But a radial
  ring reads more *digital/pro-tool* than *physical desk*; harder to make it look like real
  markers. Could work as a **colour ring on the marker** (pick marker → ring of 4 inks) rather
  than the top-level tool switch.
- **Compression:** Excellent — a ring is size-independent and floats away from edges. It's the
  most phone-robust pattern, at some cost to the skeuomorphic story.

### D. Pull-up drawer / bottom sheet
- **What:** A sheet anchored to the bottom that expands to reveal more (sticker library, fonts,
  colour extras). Standard/modal per Material; needs a collapse/close affordance when tall.
- **Exemplars:** Fresco's consolidated brush panel; FigJam stickers tab; Material 3 bottom sheets.
- **Our case:** Ideal for the **sticker sheet** ("peel" from a sheet that slides up) and for the
  **font picker** on text boxes — content that's occasional and browse-heavy. Keeps the main
  desk uncluttered.
- **Compression:** This *is* the compression strategy — rarely-used, many-item collections live
  here instead of on the tray. Full-width, scrolls internally, dismiss by drag-down (matches the
  "swipe tools away" idiom in Paper).

### E. Contextual inline toolbar (object-attached)
- **What:** A small toolbar appears *next to the selected object* with only its relevant actions.
- **Exemplars:** Apple's edit menu pattern (HIG); most canvas apps' selected-shape bars;
  FigJam/Freeform text formatting on a selected sticky.
- **Our case:** Right pattern for an already-placed **text box** (font, colour, delete-by-drag-off)
  and a placed **sticker** (rotate/scale, peel back off). Keeps global chrome minimal; the tool
  set is whatever you're touching.
- **Compression:** Naturally minimal — shows 2–4 actions for one object. Position above the
  object, flip below if near the top edge.

### F. Long-press expanding cluster
- **What:** One visible button; long-press (or tap) fans out its variants.
- **Exemplars:** Fresco favourites reorder; Apple Pencil Pro **squeeze → floating palette** in
  GoodNotes; Procreate colour/size popovers off a single swatch.
- **Our case:** Good for hiding the 4 inks behind a single marker until you pick it up, or fonts
  behind a single "A". Keeps the resting state to a few objects.
- **Compression:** Great for hiding secondary choices; the cost is discoverability (a fan-out
  isn't obvious). Fine for colour (users expect to tap a swatch) — risky for the primary mode switch.

### G. Tool-as-cursor ("in hand")
- **What:** Once picked, the tool follows/attaches to the pointer; the whole canvas is now "that
  tool". No re-selection until you put it down.
- **Exemplars:** FigJam stamp wheel (pick a stamp → click to place, stays armed); classic marking
  behaviour; Paper's "you're always drawing" flow (Rewind gesture instead of an undo button).
- **Our case:** Core to the diegetic feel — hold the marker and you're drawing until you set it
  down; peel a sticker and it's stuck to your finger until you place it. Reinforces "no undo,
  you physically remove things".
- **Compression:** No palette footprint while active — the tool is off the tray and in your hand,
  so the screen is maximally free on a small phone.

---

## 2. Preserving physical charm (what reads real vs kitsch)

**Reads as physical (do):**
- **The object is the control.** Colour = the marker you hold, not a separate swatch grid (Paper,
  GoodNotes pen-carries-its-colour). One object, one meaning.
- **Pick-up / lift on select.** Active tool physically rises, tilts, or slides out of the tray —
  cheap, unmistakable state signal, and it's how real trays behave.
- **Real gestures for real actions.** Peel a sticker off a sheet (drag), pull a text box off to
  bin it, press a pin/staple to submit. Paper's "Rewind" (two-finger circular scrub) shows a
  physical gesture beating a button — matches our no-undo stance (erase or pull off).
- **Material honesty & light.** Soft, *consistent-direction* shadows and paper/cork/felt texture
  give depth and clickability that flat design loses. Subtle, not glossy.
- **Constraints as flavour.** Exactly 4 inks, a fixed sticker sheet, a real corkboard — scarcity
  reads as "a real desk", not a settings panel.

**Reads as kitsch (avoid):**
- Heavy gloss, faux-leather stitching, drop-shadow overload — 2013-era skeuomorphism that added
  clutter and slowed comprehension.
- **Neumorphism** for actual controls: the low-contrast soft-emboss look is an accessibility
  problem (hard to tell what's tappable). Use texture/depth for *scene* objects, keep genuine
  affordances high-contrast.
- Realism that fights the gesture: a beautiful marker you can't tell is selected is worse than a
  plain highlighted one. Charm must not cost state clarity.

---

## 3. Graceful degradation & one-handed mobile

- **Thumb zone:** bottom-centre-to-bottom-side is the "easy" arc; mid-sides are "stretch"; top
  corners are "hard". ~49% of users operate one-handed. Put the marker tray + submit at the
  bottom; never park a primary tool in a top corner (Procreate does, but that's a two-hand
  tablet). Radial/floating (C) sidesteps edges entirely.
- **Tap targets ≥ 48×48 dp** (Material). Fat marker objects satisfy this for free.
- **How many at rest:** show ~4–6 objects max — our 4 markers + a text mode + a sticker/submit
  affordance. That's already the Procreate Pocket QuickMenu (6) and Concepts wheel (8) ceiling.
- **Overflow order (what to hide first):**
  1. Keep always: the 4 inks (the identity of the tool), and submit.
  2. Collapse to a drawer/sheet (D): sticker library, fonts.
  3. Behind the selected object (E): per-object edit actions (rotate/scale/delete).
  4. Behind a long-press (F): ink variants only if we ever exceed 4.
- **Dismiss to draw:** let the tray swipe away for full-canvas work and swipe back (Paper). On a
  phone the canvas is the scarce resource — chrome should be retractable.
- **Bottom sheets need a visible collapse/close** when expanded (Material) — don't rely on an
  off-screen drag alone.

---

## 4. Recommendation (prototype next)

Prototype **A (physical-object tray, bottom, thumb-zone) + G (tool-as-cursor "in hand")** as the
spine, with **D (bottom sheet)** for the sticker sheet and fonts, and **E (contextual inline bar)**
for editing a placed text box or sticker.

Why: A+G *is* the diegetic concept — the tray of 4 markers, colour = the marker you pick up, and
holding it means you're drawing until you set it down; peeling a sticker sticks it to your finger.
It keeps the resting palette to ~6 objects (fits the phone thumb zone and the QuickMenu/wheel
ceiling), and pushes everything browse-heavy into a slide-up sheet so the desk stays clear. It
directly reinforces the no-undo rule (you put tools down and pull things off, you don't press undo).

Keep a **radial colour fan (F/C)** as a fallback if the four inks ever feel cramped in a bottom
tray at ~360 px — a ring floats off the edges and is the most width-robust option, at some cost
to the "real desk" look. Don't lead with a full radial tool wheel: it reads pro-tool, not desk.

---

## 5. Sources

- (P) Procreate Pocket Handbook — QuickMenu: https://help.procreate.com/pocket/handbook/interface-gestures/quickmenu
- (P) Procreate Handbook — Interface and Gestures: https://help.procreate.com/procreate/handbook/interface-gestures
- (P) Concepts Manual — Your Workspace (Tool Wheel): https://concepts.app/en/ios/manual/yourworkspace
- (P) Concepts — Setting Up Your Menus, Brushes and Presets: https://concepts.app/en/tutorials/setting-your-menus-brushes-and-presets/
- (P) Adobe Fresco Help — User interface, gestures, Touch shortcuts: https://helpx.adobe.com/fresco/using/getting-started-with-user-interface.html
- (P) Adobe Fresco Help — Brushes overview: https://helpx.adobe.com/fresco/desktop/draw-paint-animate-and-share/brushes.html
- (P) Figma Learn — Stamps, emotes, and high-fives: https://help.figma.com/hc/en-us/articles/1500004290981-Stamps-emotes-and-high-fives
- (P) Figma Learn — Use stickers and libraries in FigJam: https://help.figma.com/hc/en-us/articles/1500004290841-Use-stickers-and-libraries-in-FigJam
- (P) Figma Learn — Sticky notes in FigJam: https://help.figma.com/hc/en-us/articles/1500004414322-Sticky-notes-in-FigJam
- (P) Material Design 3 — Bottom sheets guidelines: https://m3.material.io/components/bottom-sheets/guidelines
- (P) Apple HIG — Toolbars: https://developer.apple.com/design/human-interface-guidelines/toolbars
- (P) Apple HIG — Edit menus / Menus and actions: https://developer.apple.com/design/human-interface-guidelines/components/menus-and-actions/toolbars/
- (P) Goodnotes Support — Using the Pen tool: https://support.goodnotes.com/hc/en-us/articles/7353756785679-Using-the-Pen-tool
- (P) Goodnotes Support — Apple Pencil Pro squeeze / floating Palette: https://support.goodnotes.com/hc/en-us/articles/9757771783823-Utilize-the-new-features-of-Apple-Pencil-Pro
- Paper at 10 (!Boring / former FiftyThree designer retrospective): https://notbor.ing/words/paper-at-10
- Mastering Paper — tool guide (Rewind gesture, tool tray): https://mademistakes.com/mastering-paper/introduction-tool-guide/
- The Sweet Setup — Goodnotes vs Notability toolbars: https://thesweetsetup.com/articles/goodnotes-vs-notability-a-comparison-of-the-best-note-taking-apps/
- Nielsen-adjacent UX refs on thumb zones — Parachute Design: https://parachutedesign.ca/blog/thumb-zone-ux/ ; Juno School: https://www.junoschool.org/article/thumb-zone-design-one-handed-use/
- Skeuomorphism/flat/neumorphism trade-offs (accessibility caveat): https://www.designstudiouiux.com/blog/skeuomorphism-vs-neumorphism/
