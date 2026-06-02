import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/schema";

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const path = title === "Privacy Policy" ? "/privacy" : "/terms";

  return (
    <main className="legal-shell">
      <JsonLd
        data={[
          webPageJsonLd({
            path,
            title,
            description: `${title} for base2sol.`,
          }),
          breadcrumbJsonLd([
            { name: "base2sol", path: "/" },
            { name: title, path },
          ]),
        ]}
      />
      <aside className="legal-nav">
        <Link className="docs-brand" href="/">
          base<span>2</span>sol
        </Link>
        <nav>
          <Link href="/docs">Documentation</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </aside>

      <article className="legal-main">
        <header className="legal-hero">
          <div className="docs-kicker">{eyebrow}</div>
          <h1>{title}</h1>
          <p>Last updated: {updated}</p>
        </header>
        <div className="legal-content">{children}</div>
      </article>
    </main>
  );
}
