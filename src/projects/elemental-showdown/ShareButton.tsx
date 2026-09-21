import { useState } from "react";
import { PAPER } from "./element-colour";

// A plain link to the voting screen, which is where a visitor the crowd needs
// should land: never the Stats, which are locked to them.
const SHARED_PATH = "/elemental-showdown";
const SHARED_TITLE = "Elemental Showdown";
const SHARED_TEXT = "Which Element wins? Vote and find out.";

// The Voter closing the share sheet rejects the promise with this, which is a
// change of mind rather than anything going wrong.
const isDismissal = (cause: unknown) =>
  cause instanceof DOMException && cause.name === "AbortError";

// Bringing in the crowd the count needs: the platform's own share sheet where
// there is one, and the clipboard everywhere else.
export function ShareButton({ label }: { label: string }) {
  const [hasCopied, setCopied] = useState(false);

  function share() {
    const url = new URL(SHARED_PATH, window.location.href).href;
    if (navigator.share) {
      navigator
        .share({ title: SHARED_TITLE, text: SHARED_TEXT, url })
        .catch((cause: unknown) => {
          if (isDismissal(cause)) return;
          console.error(new Error("the share sheet failed", { cause }));
        });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch((cause: unknown) => {
        console.error(new Error("copying the link failed", { cause }));
      });
  }

  return (
    <button
      type="button"
      onClick={share}
      className="h-14 w-full rounded-[14px] font-showdown-display text-[18px]"
      style={{ boxShadow: `inset 0 0 0 3px ${PAPER}` }}
    >
      {hasCopied ? "link copied" : label}
    </button>
  );
}
