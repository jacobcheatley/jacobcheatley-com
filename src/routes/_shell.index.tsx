import { createFileRoute } from "@tanstack/react-router";
import { Projects } from "@/portfolio/Projects";

export const Route = createFileRoute("/_shell/")({ component: Projects });
