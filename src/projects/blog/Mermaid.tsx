import type { MermaidConfig } from "mermaid";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { SourceStamp } from "./source-lines";

type MermaidProps = { source?: string } & SourceStamp;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "directive-mermaid": MermaidProps;
    }
  }
}

// The narrowest slice of mermaid the Blog uses, so a test can stand in for it.
type MermaidRenderer = {
  initialize: (config: MermaidConfig) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

export type MermaidLoader = () => Promise<MermaidRenderer>;

// mermaid is by far the heaviest thing an Article can pull in and it needs a
// browser, so it arrives only through this import, and only once a diagram is
// on the page. The context is the seam a test or the editor replaces.
export const MermaidLoaderContext = createContext<MermaidLoader>(
  async () => (await import("mermaid")).default,
);

type ArticleSurface = "page" | "editor";

// A diagram redraws at every keystroke in the writing room, where a reader's
// page draws it once: the room says which surface this is.
export const ArticleSurfaceContext = createContext<ArticleSurface>("page");

// A drawing belongs to the source it was drawn from, which in the writing
// room is not always the source the diagram now holds.
type Drawing =
  | { status: "undrawn" }
  | { status: "drawn"; source: string; svg: string }
  | { status: "failed"; source: string; message: string };

// The palette tokens are light-dark() expressions, which mermaid cannot read,
// so a throwaway element resolves each against the scheme in force.
function paletteThemeVariables() {
  const probe = document.createElement("span");
  probe.style.fontFamily = "var(--font-sans)";
  document.body.append(probe);
  const colour = (token: string) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };

  const paper = colour("--color-paper");
  const variables = {
    fontFamily: getComputedStyle(probe).fontFamily,
    primaryColor: colour("--color-surface"),
    primaryTextColor: colour("--color-ink"),
    primaryBorderColor: colour("--color-accent"),
    lineColor: colour("--color-muted"),
    background: paper,
    secondaryColor: paper,
    tertiaryColor: paper,
    edgeLabelBackground: paper,
  };

  probe.remove();
  return variables;
}

// Nothing here is allowed to leave a hole where a diagram was: whether the
// import, the font or the diagram itself fails, the reader keeps the source
// with mermaid's message under it, which is the handling.
async function drawDiagram(
  loadMermaid: MermaidLoader,
  diagramId: string,
  source: string,
): Promise<Drawing> {
  try {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: paletteThemeVariables(),
      // Otherwise mermaid leaves its own error drawing in the page beside the
      // source this component puts back.
      suppressErrorRendering: true,
    });
    // mermaid sizes a label by measuring its text, so drawing before the face
    // has loaded clips the labels.
    await document.fonts.load('16px "IBM Plex Sans"');
    const { svg } = await mermaid.render(diagramId, source);
    return { status: "drawn", source, svg };
  } catch (error) {
    return {
      status: "failed",
      source,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function Mermaid({ source = "", ...stamp }: MermaidProps) {
  const loadMermaid = useContext(MermaidLoaderContext);
  const surface = useContext(ArticleSurfaceContext);
  // mermaid puts the id in selectors of the stylesheet it writes into the SVG.
  const diagramId = `mermaid-${useId().replaceAll(/[^a-zA-Z0-9]/g, "")}`;
  const [drawing, setDrawing] = useState<Drawing>({ status: "undrawn" });
  const [lastDrawing, setLastDrawing] = useState("");
  const draws = useRef(0);

  useEffect(() => {
    let showing = true;
    const draw = () => {
      // mermaid clears out whatever already holds the id it is about to draw
      // into, so a drawing on the page keeps the id of the draw that made it.
      draws.current += 1;
      const drawId = `${diagramId}-${draws.current}`;
      void drawDiagram(loadMermaid, drawId, source).then((next) => {
        if (!showing) return;
        setDrawing(next);
        if (next.status === "drawn") setLastDrawing(next.svg);
      });
    };

    draw();
    const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
    darkScheme.addEventListener("change", draw);
    return () => {
      showing = false;
      darkScheme.removeEventListener("change", draw);
    };
  }, [loadMermaid, diagramId, source]);

  const isDrawn = drawing.status === "drawn" && drawing.source === source;
  // In the writing room the last good drawing holds the diagram's place while
  // the source it was drawn from is mid-edit or being drawn again.
  const svg = isDrawn ? drawing.svg : surface === "editor" ? lastDrawing : "";

  if (svg) {
    return (
      <div
        className={isDrawn ? "mermaid-diagram" : "mermaid-diagram is-stale"}
        {...stamp}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid's default securityLevel "strict" sanitises the SVG it returns, and it is markup, not children.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <>
      <pre {...stamp}>
        <code>{source}</code>
      </pre>
      {drawing.status === "failed" && (
        <p className="mermaid-error">{drawing.message}</p>
      )}
    </>
  );
}
