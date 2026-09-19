# Coding Standards

Follow these for all code you write, change, or review.

## 1. Less code

- The best code is the code that is not there. Before adding anything, ask what happens
  if you do not. Build for the case in front of you: no speculative flexibility, no
  config nobody sets, no guard for a race that cannot happen.
- Look before you write. The helper, type, client, or pattern you need probably exists
  in this repo or an installed dependency. Reimplementing it a few files over is the most
  common defect in our codebase. Search first, reuse, and extend the shared one if it
  falls short.
- Prefer the boring solution: plain functions, the standard library and web platform,
  the pattern the file next door already uses. No new dependency for what the platform
  or an existing dependency does.
- Do not abstract speculatively. Wait for the same shape three times and an obvious
  name. A wrong abstraction is harder to undo than duplication.
- Make it work, make it right, make it fast, and stop when the current step is enough.
  Tidy first as its own commit, then the behaviour change. Never mix a refactor with a
  feature in one diff.
- Never rewrite from scratch what can be fixed. Old code has been debugged against
  reality. Read it, understand why it is odd, then change it.
- Locality beats elegance. Code that changes together lives together.

## 2. Naming

- A name says what a thing is and does precisely enough that the reader never opens it.
  If a comment is needed to explain a name, the name is wrong.
- Name for the domain, not the mechanism: `reportingFloor`, not `threshold2`;
  `userLocalDate`, not `dateStr`.
- Make wrong code look wrong. Put the distinction that matters in the name so misuse is
  visible at the call site: `startDateUtc` beside `startDateLocal`.
- A boolean reads as a predicate (`hasNote`), a function as a verb phrase
  (`resolveUserPermissions`), a collection is plural, a type is a noun. No `I` or `T`
  prefixes on interfaces and types.
- No abbreviations a newcomer cannot expand, no type suffixes (`userList`), no numbered
  variants (`data2`), no generic nouns (`manager`, `helper`, `util`, `info`, `data`)
  unless nothing more specific is true.
- When a name stops being true, rename it in the same change. If you cannot name it,
  you do not yet know what it is: split it until you can.

## 3. Types over primitives

- Stringly typed code is a defect. A `string` carrying a mode, an ID, a date, a status,
  or a unit is a bug waiting to be misspelled. Give it a literal union, a branded type,
  or a parsed structure: `ink: Ink`, not `ink: string`. Prefer a literal union
  to a TypeScript `enum`.
- A bare `number` that is a score, a bare `number` that is a rating on 0 to 100, a bare
  `string` that is an email address: each is a type that cannot be handed to a function
  expecting the other. A `Record<string, unknown>` or tuple that means "a time window"
  is an object type with named fields.
- Parse, do not validate. Convert loose input into a typed value once at the boundary
  with a zod schema; everything inside receives a value that cannot be malformed, and
  the type is inferred from the schema rather than written twice.
- Do not lie to the compiler. `any`, an `as` cast, and a non-null `!` each switch off
  the check that this section relies on. Take `unknown` and narrow it; `as const` and
  `satisfies` are fine.
- A unit or frame of reference is in the type, or at least the name: `Seconds`, `Utc`,
  `SiteLocal`, `Metres`. Never a bare number whose unit lives in a comment.
- Make illegal states unrepresentable. Two fields that must be present together are one
  field. A value with three valid forms is a discriminated union, not a string with
  magic values, and a `switch` over it is exhaustive.

## 4. Abstractions and contracts

- An abstraction hides one decision. If callers reach around it, it leaks: fix it or
  remove it. When the system outgrows a boundary, redraw it rather than bolting on flags
  and special cases.
- One concept per unit, one level of abstraction per function. A function that mixes
  wire parsing with business rules is two functions.
- Depend on the narrowest thing that works. A function that needs a date takes a date,
  not the request that contains it.
- Every seam that will be tested or swapped is an injected dependency, never a
  constructor call buried in the function. `new AnalysisService()` inline in a handler
  is a seam that does not exist.
- No boolean flag arguments that switch behaviour: write two functions. No side effects
  behind an innocent name: a getter does not write. No shared mutable globals.

## 5. Errors

- Catch-all exception handling is a defect. Catching everything and discarding it turns
  a bug into a data problem found months later. Every `catch` in TypeScript catches
  everything, so keep the `try` around the one call that can fail, narrow the `unknown`
  error with `instanceof`, handle what you can at the level that can handle it, and
  rethrow the rest. A rejected promise is an error: no floating promises, no empty
  `.catch()`.
- A broad catch that must exist says in its interface why continuing is safe, logs the
  original error with its cause chain intact (`new Error(message, { cause })` when
  wrapping), and has a test proving it neither throws nor swallows silently.
- Fail loudly and early on programmer errors. A silent fallback to a default is a
  disguised catch-all.
- Exceptions for exceptional things, typed results for expected outcomes: a
  discriminated union the caller must narrow. Never a sentinel (`-1`, `""`) a caller can
  forget to check when a type would force them to.
- An error message names the operation, the thing it was operating on, and the value
  that caused it. The log line inside a handler must not itself be able to throw.

## 6. Tests

- Tests and `bun run check` are green before a change is done: all of them, run by you.
- Test behaviour through the contract a caller would use. Never private structure, never
  source text, never a mock of the thing under test. Prefer a few integration tests over
  the real path to many unit tests that mock the world: mocks prove the mocks.
- One concept per test, named for the behaviour it pins. The test name is the spec.
- A claim that matters is a test, not a comment. Every bug fix ships with a test that
  fails on the old code.
- Test both ends of a range and the boundary. Fix or delete slow, flaky, or
  environment-dependent tests; never skip them.

## 7. Change hygiene

- Leave the lines you touched cleaner than you found them. Do not reformat what you did
  not change.
- Delete dead code; it is in git. Commented-out code is dead code. Remove every caller
  before removing the thing.
- A PR does one thing. Its description carries the why, the history, the alternatives,
  and the verification. The code carries none of that.

## When reviewing

- Read the whole diff and the surrounding code before judging any line. Run the tests.
- Check in priority order: what can be deleted or replaced by something that already
  exists, names, primitives that should be types, leaking abstractions, catch-alls, then
  the rest.
- The most valuable comment is "delete this". Then "this already exists", "this needs a
  type", "this needs a test".
- Distinguish blocking from taste, and say which. A design objection comes with the
  simpler alternative.