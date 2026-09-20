import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BlogLayout } from "@/projects/blog/BlogLayout";

export const Route = createFileRoute("/blog")({ component: BlogRoute });

function BlogRoute() {
  return (
    <BlogLayout>
      <Outlet />
    </BlogLayout>
  );
}
