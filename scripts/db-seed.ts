import { dbHost } from "@/db/index.server";
import { seedBlog } from "@/projects/blog/seed.server";

await seedBlog();
console.log(`seeded the Blog into ${dbHost}`);
process.exit(0);
