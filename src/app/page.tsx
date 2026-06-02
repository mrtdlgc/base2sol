import { BridgeConsole } from "@/components/BridgeConsole";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/schema";
import { KNOWN_PAIR_REQUEST_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function Page() {
  return (
    <main className="shell">
      <JsonLd
        data={[
          webPageJsonLd({
            path: "/",
            title: SITE_NAME,
            description: SITE_DESCRIPTION,
          }),
          breadcrumbJsonLd([{ name: "base2sol", path: "/" }]),
        ]}
      />
      <header className="masthead">
        <h1>
          <span className="brand-base">base</span>
          <span className="brand-join">2</span>
          <span className="brand-sol">sol</span>
        </h1>
        <div className="tag">
          register Base tokens on Solana <span className="blink" />
          <br />
          then bridge both ways - powered by base/bridge-sdk
          <div className="mast-actions">
            <a className="doc-link" href="/docs">
              Documentation
            </a>
          </div>
        </div>
      </header>

      <BridgeConsole />

      <footer className="footer">
        <span>base2sol is non-custodial - verify every address - start with small amounts</span>
        <nav className="footer-links" aria-label="Product links">
          <a href="/docs">Docs</a>
          <a href="/skill.md">Skill.md</a>
          {KNOWN_PAIR_REQUEST_URL && (
            <a href={KNOWN_PAIR_REQUEST_URL} target="_blank" rel="noreferrer">
              Known pair request
            </a>
          )}
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </main>
  );
}
