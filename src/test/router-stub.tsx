// TanStack's <Link> needs a router context a component test doesn't want to
// build; this renders it as a plain anchor, with `$param` segments filled in.
// Use as the `vi.mock` factory:
// `vi.mock("@tanstack/react-router", () => import("@/test/router-stub"))`.
export const Link = ({
  children,
  to,
  params,
  activeOptions: _activeOptions,
  ...rest
}: React.ComponentProps<"a"> & {
  to?: string;
  params?: Record<string, string>;
  activeOptions?: { exact: boolean };
}) => (
  <a
    href={Object.entries(params ?? {}).reduce(
      (path, [name, value]) => path.replace(`$${name}`, value),
      to ?? "",
    )}
    {...rest}
  >
    {children}
  </a>
);
