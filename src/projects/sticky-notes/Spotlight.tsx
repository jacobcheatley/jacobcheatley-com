import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { NOTE_ASPECT_RATIO, NoteRender } from "./note-render";
import type { NoteContent } from "./note-schema";

// The shadow follows the paper silhouette, so a drop-shadow filter rather than
// a box one.
const noteStyle: CSSProperties = {
  aspectRatio: NOTE_ASPECT_RATIO,
  filter: "drop-shadow(0 12px 30px rgba(0,0,0,.5))",
};

export function Spotlight({
  content,
  label,
  onClose,
  children,
}: {
  content: NoteContent;
  label: string;
  // Only when the scrim and a × are the way back; pinning brings its own.
  onClose?: () => void;
  children?: ReactNode;
}) {
  // Move focus into the dialog on open, so Esc and the close button are reachable
  // by keyboard right away.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Pinning hands over a new note for every choice, even the same fastener twice
  // over, so the paper is keyed by how many have been made: each one mounts
  // afresh for the press-on keyframes (styles.css, on `data-press`) to replay.
  const [press, setPress] = useState({ content, n: 0 });
  if (press.content !== content) setPress({ content, n: press.n + 1 });
  const pressing = press.n > 0 && content.fastener !== "none";

  // With a way back the scrim is a real button (the tap-out target); the note
  // and whatever hangs below it sit layered above it, so clicking them never
  // reaches the scrim and no static element needs a click handler.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6"
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close note"
          className="absolute inset-0 h-full w-full cursor-zoom-out border-0 bg-black/70"
        />
      ) : (
        // the pinning's scrim comes up over the wall as the note flies in
        <div className="starting:opacity-0 absolute inset-0 bg-black/70 transition-opacity duration-500 ease-out" />
      )}
      {onClose && (
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close note"
          className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full border-0 bg-white/15 font-sans text-2xl leading-none text-white hover:bg-white/25"
        >
          ×
        </button>
      )}
      <div
        data-spotlight=""
        className="relative z-10 w-[min(85vmin,520px)] select-none"
        style={noteStyle}
      >
        <div
          key={press.n}
          data-press={pressing ? content.fastener : undefined}
          className="h-full"
        >
          <NoteRender content={content} />
        </div>
      </div>
      {children}
    </div>
  );
}
