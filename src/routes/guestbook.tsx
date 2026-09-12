import { createFileRoute, Link } from "@tanstack/react-router";
import { GuestbookForm } from "@/projects/guestbook/GuestbookForm";
import { listEntriesFn } from "@/projects/guestbook/guestbook.fn";

export const Route = createFileRoute("/guestbook")({
  loader: () => listEntriesFn(),
  component: Guestbook,
});

function Guestbook() {
  const entries = Route.useLoaderData();
  return (
    <main>
      <Link to="/">← jacobcheatley.com</Link>
      <h1>Guestbook</h1>
      <GuestbookForm />
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.name}</strong>
            <p>{entry.message}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
