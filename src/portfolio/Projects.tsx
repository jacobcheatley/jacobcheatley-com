import { Cover as BlogCover } from "@/projects/blog/Cover";
import { Cover as ElementalShowdownCover } from "@/projects/elemental-showdown/Cover";
import { Cover as StickyNotesCover } from "@/projects/sticky-notes/Cover";
import { ProjectLink } from "./ProjectLink";

export function Projects() {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-5 gap-y-6">
      <ProjectLink
        to="/sticky-notes"
        title="Sticky Notes"
        cover={<StickyNotesCover />}
      />
      <ProjectLink to="/blog" title="Blog" cover={<BlogCover />} />
      <ProjectLink
        to="/elemental-showdown"
        title="Elemental Showdown"
        cover={<ElementalShowdownCover />}
      />
    </ul>
  );
}
