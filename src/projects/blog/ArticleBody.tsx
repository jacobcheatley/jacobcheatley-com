import Markdown, { type Options } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

// The Blog's whole Markdown pipeline. It is synchronous, so the one component
// serves the server render, hydration and the editor preview. There is no
// rehype-raw and no sanitiser, which is what makes raw HTML come out as text.
const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];

const rehypePlugins: Options["rehypePlugins"] = [
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "append",
      content: { type: "text", value: "#" },
      properties: { className: "anchor", ariaLabel: "Link to this heading" },
    },
  ],
];

export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="prose">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {markdown}
      </Markdown>
    </div>
  );
}
