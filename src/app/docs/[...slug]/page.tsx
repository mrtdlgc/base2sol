import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownDoc } from "@/components/docs/MarkdownDoc";
import { JsonLd } from "@/components/seo/JsonLd";
import { docsBySection, docsPages, docsSections, getDocsPage } from "@/lib/docs/manifest";
import { breadcrumbJsonLd, techArticleJsonLd, webPageJsonLd } from "@/lib/seo/schema";

export const dynamicParams = false;

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export function generateStaticParams() {
  return docsPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) {
    return { title: "Docs - base2sol" };
  }

  return {
    title: `${page.title} - base2sol docs`,
    description: page.description,
  };
}

export default async function DocsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) notFound();

  const markdown = await readFile(path.join(process.cwd(), page.file), "utf8");

  return (
    <main className="docs-shell">
      <aside className="docs-sidebar">
        <Link className="docs-brand" href="/">
          base<span>2</span>sol
        </Link>
        <nav className="docs-page-nav">
          <Link href="/docs">Overview</Link>
          {docsSections.map((section) => (
            <div className="docs-nav-group" key={section}>
              <div>{section}</div>
              {docsBySection(section).map((item) => (
                <Link
                  className={item.href === page.href ? "active" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <article className="docs-main docs-article">
        <JsonLd
          data={[
            webPageJsonLd({
              path: page.href,
              title: `${page.title} - base2sol docs`,
              description: page.description,
            }),
            techArticleJsonLd({
              path: page.href,
              title: page.title,
              description: page.description,
            }),
            breadcrumbJsonLd([
              { name: "base2sol", path: "/" },
              { name: "Documentation", path: "/docs" },
              { name: page.section, path: "/docs" },
              { name: page.title, path: page.href },
            ]),
          ]}
        />
        <div className="docs-breadcrumb">
          <Link href="/docs">Docs</Link>
          <span>/</span>
          <span>{page.section}</span>
        </div>
        <MarkdownDoc markdown={markdown} currentFile={page.file} />
      </article>
    </main>
  );
}
