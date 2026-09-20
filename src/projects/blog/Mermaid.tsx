import type { MermaidConfig } from "mermaid";
import { createContext, useContext, useEffect, useId, useState } from "react";

type MermaidProps = { source?: string };

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

type Drawing =
  | { status: "source" }
  | { status: "drawn"; svg: string }
  | { status: "failed"; message: string };

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
    return { status: "drawn", svg };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function Mermaid({ source = "" }: MermaidProps) {
  const loadMermaid = useContext(MermaidLoaderContext);
  // mermaid puts the id in selectors of the stylesheet it writes into the SVG.
  const diagramId = `mermaid-${useId().replaceAll(/[^a-zA-Z0-9]/g, "")}`;
  const [drawing, setDrawing] = useState<Drawing>({ status: "source" });

  useEffect(() => {
    let showing = true;
    const draw = () => {
      void drawDiagram(loadMermaid, diagramId, source).then((next) => {
        if (showing) setDrawing(next);
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

  if (drawing.status === "drawn") {
    return (
      <div
        className="mermaid-diagram"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid's default securityLevel "strict" sanitises the SVG it returns, and it is markup, not children.
        dangerouslySetInnerHTML={{ __html: drawing.svg }}
      />
    );
  }

  return (
    <>
      <pre>
        <code>{source}</code>
      </pre>
      {drawing.status === "failed" && (
        <p className="mermaid-error">{drawing.message}</p>
      )}
    </>
  );
}
