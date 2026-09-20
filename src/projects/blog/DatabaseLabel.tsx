import type { EditorDatabase } from "./blog-editor.server";

// The editor's guard against writing to the wrong Blog: Production wears the
// palette's one red, Local keeps quiet, and the host itself is the tooltip.
export function DatabaseLabel({ host, isLocal }: EditorDatabase) {
  return (
    <span
      title={host}
      className={isLocal ? "text-muted" : "font-semibold text-name"}
    >
      {isLocal ? "Local" : "Production"}
    </span>
  );
}
