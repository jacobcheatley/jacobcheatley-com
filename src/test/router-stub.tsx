// TanStack's <Link> needs a router context a component test doesn't want to
// build; this renders it as a plain anchor. Use as the `vi.mock` factory:
// `vi.mock("@tanstack/react-router", () => import("@/test/router-stub"))`.
export const Link = ({
  children,
  to,
  ...rest
}: React.ComponentProps<"a"> & { to?: string }) => (
  <a href={to} {...rest}>
    {children}
  </a>
);
