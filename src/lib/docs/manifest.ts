export interface DocsPage {
  title: string;
  description: string;
  href: string;
  file: string;
  section: "Product" | "Guides" | "Operators" | "Reference";
  slug: string[];
}

function page(
  section: DocsPage["section"],
  title: string,
  description: string,
  path: string
): DocsPage {
  return {
    section,
    title,
    description,
    href: `/docs/${path}`,
    file: `docs/${path}.md`,
    slug: path.split("/"),
  };
}

export const docsPages: DocsPage[] = [
  page(
    "Product",
    "What is base2sol?",
    "A complete bridge frontend for registering Base tokens on Solana and moving assets both ways.",
    "product/what-is-base2sol"
  ),
  page(
    "Product",
    "How it works",
    "Browser wallets sign source, proof, and execution transactions while the SDK handles bridge messages.",
    "product/how-it-works"
  ),
  page(
    "Product",
    "Supported routes",
    "Base ERC20s, ETH, SOL, SPL tokens, and bridge-wrapped return assets.",
    "product/supported-assets-and-routes"
  ),
  page(
    "Guides",
    "Register a Base token",
    "Create a Solana Token-2022 mint, register it back on Base, then bridge.",
    "guides/register-a-base-token"
  ),
  page(
    "Guides",
    "Register a Solana token",
    "Deploy a Base CrossChainERC20 representation for a Solana mint, then bridge.",
    "guides/register-a-solana-token"
  ),
  page(
    "Guides",
    "Bridge Base to Solana",
    "Approve, bridge on Base, wait for checkpoint state, prove, and execute on Solana.",
    "guides/bridge-base-to-solana"
  ),
  page(
    "Guides",
    "Bridge Solana to Base",
    "Lock or burn on Solana, then use auto relay or manually execute on Base.",
    "guides/bridge-solana-to-base"
  ),
  page(
    "Guides",
    "Request a known pair",
    "Submit a GitHub issue with addresses, decimals, registration evidence, and official sources.",
    "guides/request-known-pair"
  ),
  page(
    "Guides",
    "Use testnet",
    "Base Sepolia plus Solana devnet with manual registration execution by default.",
    "guides/use-testnet"
  ),
  page(
    "Operators",
    "Run and deploy",
    "Run locally, build with Docker, and deploy base2sol on Coolify.",
    "operators/run-and-deploy"
  ),
  page(
    "Operators",
    "RPC and environment configuration",
    "Configure public build-time defaults and user-editable RPC endpoints.",
    "operators/rpc-and-env"
  ),
  page(
    "Reference",
    "Networks and deployments",
    "Chain IDs, default RPCs, bridge contracts, Solana programs, and bridge state accounts.",
    "reference/networks-and-deployments"
  ),
  page(
    "Reference",
    "Wallets and signing",
    "Which wallet signs each route, and how local operation recovery works.",
    "reference/wallets-and-signing"
  ),
  page(
    "Reference",
    "Troubleshooting",
    "Common errors and what to do when a bridge operation is waiting or blocked.",
    "reference/troubleshooting"
  ),
  page(
    "Reference",
    "Security model and limitations",
    "What base2sol does, what it does not do, and the current product limits.",
    "reference/security-and-limitations"
  ),
];

export const docsSections = ["Product", "Guides", "Operators", "Reference"] as const;

export function getDocsPage(slug: string[]): DocsPage | undefined {
  const path = slug.join("/");
  return docsPages.find((item) => item.slug.join("/") === path);
}

export function docsBySection(section: DocsPage["section"]): DocsPage[] {
  return docsPages.filter((item) => item.section === section);
}
