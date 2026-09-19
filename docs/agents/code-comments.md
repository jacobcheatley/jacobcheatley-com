# Code Comments

Applies to every comment and doc comment (`/** */`), in any language.

## The rule

A comment describes the current state of the code and says only what the code cannot
say. Before writing one, make the code say it instead: a better name, a named constant,
a type, a `satisfies`, a test. If none of the uses below applies, delete the comment.

## What a comment is for

- The why behind a value the code cannot justify: a magic number, a clamp bound, a
  threshold. One line.
- A non-obvious invariant or trap the code cannot enforce: evaluation order that must
  not change, two lists that must stay in sync.
- An external contract this code implements: a wire format, a regex the API validates
  against, a protocol requirement.
- A surprising branch that looks like a bug and is not.
- The reason on a suppression: `biome-ignore` and `@ts-expect-error` always say why the
  rule is wrong here. Never `@ts-ignore`, never a bare directive.

## Never in source

- History ("previously", "used to", "was 7.3", dates, who decided). It lives in git and
  the PR description.
- Ticket and PR identifiers (`#533`, links). The branch name and commit
  message carry them.
- Validation and measurement ("verified on 200 cases", "321ms to 24ms", percentages,
  sweep tables). A claim that matters is a test that fails when it stops being true.
- Plans and futures ("follow-up", "stage 2 replaces this", TODO essays). They go in a
  ticket.
- How other code, files, services, or repos behave. At most a one-line pointer by name.
- Narration of the next line, reasoning that already has a home elsewhere, and roads
  not taken. The last belongs in the PR description.
- Types in a doc comment (`@param {string}`, `@returns {number}`). The signature has
  them and the compiler keeps it honest.
- Essays. A comment over three lines is a doc. Move it and leave a pointer.

## When reviewing

Run these on the added lines and report each failure by file and line:

- `grep -nE '#[0-9]{2,}\b'` on comment lines must return nothing but hex colours.
- `grep -nE 'previously|used to|was [0-9]|moved (from|this)|since [0-9]|replaced|follow-up|no longer'`
  on comment lines: each hit is history or a plan unless it describes runtime state
  ("a pointer id that is no longer live").
- `grep -nE 'biome-ignore|@ts-(ignore|expect-error|nocheck)'`: each hit carries a reason,
  and none is `@ts-ignore` or `@ts-nocheck`.
- A comment with `%`, a version number, a date, or a count over 100 is a measurement.
- A comment naming a function, constant, path, or number: verify it still matches.
- Bare magic numbers with no why are the flip side. Flag those too.