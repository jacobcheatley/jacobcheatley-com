import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useState, useTransition } from "react";
import { entrySchema } from "./entry-schema";
import { addEntryFn } from "./guestbook.fn";

// Uncontrolled form: FormData → entrySchema (browser-side check) → addEntryFn
// (the server re-validates; that's the trust boundary). The entry stays pending
// until the owner approves it from the moderation CLI.
export function GuestbookForm() {
  const addEntry = useServerFn(addEntryFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    const form = event.currentTarget;
    const parsed = entrySchema.safeParse(
      Object.fromEntries(new FormData(form)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your entry.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addEntry({ data: parsed.data });
        form.reset();
        setSubmitted(true);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Name
        <input name="name" />
      </label>
      <label>
        Message
        <textarea name="message" />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {submitted ? (
        <p role="status">
          Thanks — your entry will appear once it has been approved.
        </p>
      ) : null}
      <button type="submit" disabled={isPending}>
        {isPending ? "Submitting…" : "Sign the guestbook"}
      </button>
    </form>
  );
}
