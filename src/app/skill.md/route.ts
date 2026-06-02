import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  const skill = readFileSync(path.join(process.cwd(), "SKILL.md"), "utf8");

  return new Response(skill, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
