import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell")({ component: Shell });

function Shell() {
  return (
    <main className="mx-auto grid max-w-[58rem] gap-[clamp(2.5rem,5vw,4rem)] px-4 pt-[clamp(3rem,8vw,6rem)] pb-16">
      <header className="grid gap-2 text-center">
        <h1 className="font-serif text-[clamp(2.75rem,7vw,4.5rem)] font-medium italic leading-none tracking-[-0.01em] text-name">
          Jacob Cheatley
        </h1>
        <p className="text-[1.25rem] text-muted">
          Games, puzzles and other small projects.
        </p>
      </header>
      <Outlet />
      <footer className="flex justify-center border-t border-line pt-8 font-sans text-[0.9375rem]">
        <a
          href="https://github.com/jacobcheatley"
          className="text-muted no-underline hover:text-accent hover:underline"
        >
          GitHub
        </a>
      </footer>
    </main>
  );
}
