import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { docsBySection } from "@/lib/docs/manifest";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/schema";

const productLinks = docsBySection("Product");
const guideLinks = docsBySection("Guides");
const docsDescription =
  "base2sol documentation for token registration, bridging, testnet use, deployment, and operations.";

export default function DocsPage() {
  return (
    <main className="docs-shell">
      <JsonLd
        data={[
          webPageJsonLd({
            path: "/docs",
            title: "base2sol documentation",
            description: docsDescription,
          }),
          breadcrumbJsonLd([
            { name: "base2sol", path: "/" },
            { name: "Documentation", path: "/docs" },
          ]),
        ]}
      />
      <aside className="docs-sidebar">
        <a className="docs-brand" href="/">
          base<span>2</span>sol
        </a>
        <nav>
          <a href="#overview">Overview</a>
          <a href="#flows">Product flows</a>
          <a href="#using">How to use</a>
          <a href="#operators">Operators</a>
          <a href="#reference">Reference</a>
        </nav>
      </aside>

      <article className="docs-main">
        <section className="docs-hero" id="overview">
          <div className="docs-kicker">Documentation</div>
          <h1>base2sol</h1>
          <p className="docs-lead">
            base2sol is a non-custodial frontend for the Base Bridge
            Base-to-Solana route. It helps teams register Base ERC20s as
            Solana Token-2022 mints, then gives users a clear interface for
            bridging between Base and Solana.
          </p>
          <div className="docs-actions">
            <a className="btn" href="/">
              Open app
            </a>
            <a className="btn ghost" href="#using">
              Read quickstart
            </a>
          </div>
        </section>

        <section className="docs-section" id="flows">
          <h2>Product flows</h2>
          <p>
            The product separates first-time token registration from ordinary
            transfers. That keeps token-team setup explicit while preserving a
            simple bridge flow once a token is registered.
          </p>
          <div className="docs-grid">
            {productLinks.map((item) => (
              <Link className="docs-card" href={item.href} key={item.href}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span>Read page</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="docs-section" id="using">
          <h2>How to use base2sol</h2>
          <div className="docs-steps">
            <div>
              <span>1</span>
              <p>Select Mainnet or Testnet and connect the required wallets.</p>
            </div>
            <div>
              <span>2</span>
              <p>
                For a new Base ERC20, choose Base to Solana, Base token, then
                Create new mint.
              </p>
            </div>
            <div>
              <span>3</span>
              <p>
                Create the Solana mint, wait for registration execution on Base,
                then use the minted address for transfers.
              </p>
            </div>
            <div>
              <span>4</span>
              <p>
                For existing pairs, enter the source token, destination token,
                amount, decimals, and recipient.
              </p>
            </div>
            <div>
              <span>5</span>
              <p>
                Sign the source transaction, then complete prove and execute
                steps when the route requires them.
              </p>
            </div>
          </div>
        </section>

        <section className="docs-section">
          <h2>Guides</h2>
          <div className="docs-grid">
            {guideLinks.map((item) => (
              <Link className="docs-card" href={item.href} key={item.href}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span>Read guide</span>
              </Link>
            ))}
          </div>
          <div className="docs-callout">
            The documentation source lives in the repository `docs/` directory.
            base2sol renders those Markdown files directly, so the docs deploy
            with the app and do not depend on a hosted documentation platform.
          </div>
        </section>

        <section className="docs-section" id="operators">
          <h2>Operators</h2>
          <p>
            base2sol ships as a Next.js app with standalone Docker output. It
            does not require a server-side signer or bridge backend.
          </p>
          <div className="docs-code">
            <code>npm install</code>
            <code>npm run dev</code>
            <code>npm run typecheck</code>
            <code>docker build -t base2sol .</code>
          </div>
        </section>

        <section className="docs-section" id="reference">
          <h2>Reference</h2>
          <table className="docs-table">
            <tbody>
              <tr>
                <th>Mainnet</th>
                <td>Base chain 8453 and Solana mainnet-beta</td>
              </tr>
              <tr>
                <th>Testnet</th>
                <td>Base Sepolia chain 84532 and Solana devnet</td>
              </tr>
              <tr>
                <th>Wallets</th>
                <td>MetaMask for Base, Phantom for Solana</td>
              </tr>
              <tr>
                <th>Storage</th>
                <td>One pending operation per environment in browser localStorage</td>
              </tr>
              <tr>
                <th>Safety</th>
                <td>Verify token addresses and start with tiny amounts</td>
              </tr>
            </tbody>
          </table>
        </section>
      </article>
    </main>
  );
}
