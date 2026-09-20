import type { ReactNode } from "react";
import type { SourceStamp } from "./source-lines";

const calloutKinds = ["note", "warning"] as const;

type CalloutProps = { kind?: string; children?: ReactNode } & SourceStamp;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "directive-callout": CalloutProps;
    }
  }
}

// An Article's attributes are data a writer typed, so a kind the Blog does not
// know reads as a note rather than breaking the page.
function calloutLabel(kind: string | undefined) {
  return calloutKinds.find((known) => known === kind) ?? "note";
}

export function Callout({ kind, children, ...stamp }: CalloutProps) {
  return (
    <aside className="callout" {...stamp}>
      <p className="callout-label">{calloutLabel(kind)}</p>
      {children}
    </aside>
  );
}
