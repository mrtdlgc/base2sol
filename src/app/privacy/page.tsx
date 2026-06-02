import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How base2sol handles wallet data, local operation state, RPC providers, and non-custodial bridge activity.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated="June 2, 2026">
      <section>
        <h2>Overview</h2>
        <p>
          base2sol is a non-custodial bridge frontend. The app is designed to
          work without accounts, passwords, server-side private keys, or
          custody of user funds.
        </p>
        <p>
          This policy explains what information the base2sol interface processes
          when you connect wallets, register a token, or bridge between Base and
          Solana.
        </p>
      </section>

      <section>
        <h2>Information processed in your browser</h2>
        <p>
          The app may process the following information locally in your browser:
        </p>
        <ul>
          <li>connected wallet addresses from MetaMask and Phantom;</li>
          <li>selected network, route, token addresses, amounts, and recipients;</li>
          <li>custom RPC URLs you enter in the RPC settings panel;</li>
          <li>pending operation references saved in localStorage;</li>
          <li>activity messages needed to show bridge progress.</li>
        </ul>
        <p>
          localStorage is used so the app can recover the latest pending
          operation for the selected environment after a reload. Clearing your
          browser storage removes that local recovery state.
        </p>
      </section>

      <section>
        <h2>Information visible on-chain</h2>
        <p>
          Bridge transactions are public blockchain transactions. Wallet
          addresses, token addresses, transfer amounts, transaction hashes,
          message references, and execution status may be visible on Base,
          Base Sepolia, Solana, Solana devnet, and related explorers.
        </p>
      </section>

      <section>
        <h2>Wallets, RPCs, and infrastructure providers</h2>
        <p>
          base2sol asks wallet extensions and RPC endpoints to perform the work
          needed for bridge operations. Those providers may receive request
          details such as wallet addresses, transaction payloads, signatures,
          IP addresses, and browser request metadata according to their own
          policies.
        </p>
        <p>
          A deployment host, CDN, or reverse proxy may also collect standard
          access logs such as IP address, user agent, request path, and time of
          request.
        </p>
      </section>

      <section>
        <h2>Cookies and analytics</h2>
        <p>
          The official base2sol deployment uses Google Analytics through the
          Google tag (`gtag.js`) with measurement ID `G-FHQ8TKQ129` and
          Cloudflare Web Analytics/Insights to understand web traffic,
          reliability, referrals, page views, browser and device information,
          approximate location, and aggregate usage patterns.
        </p>
        <p>
          These analytics providers may receive request metadata such as IP
          address, user agent, page URL, referrer, and timing information, and
          Google Analytics may use cookies or similar identifiers according to
          Google's own policies. Cloudflare Insights may process traffic and
          performance metadata as part of Cloudflare's analytics services.
        </p>
        <p>
          Analytics are used to improve product reliability and understand
          usage. They are not used to request seed phrases, private keys, or
          custody of funds. Browser privacy tools may block or limit these
          analytics requests.
        </p>
      </section>

      <section>
        <h2>How information is used</h2>
        <p>Information is used to:</p>
        <ul>
          <li>build and submit wallet transactions;</li>
          <li>derive Solana associated token accounts when requested;</li>
          <li>track bridge status and recover pending operations;</li>
          <li>diagnose errors and improve product reliability.</li>
        </ul>
      </section>

      <section>
        <h2>What base2sol does not do</h2>
        <ul>
          <li>base2sol does not ask for seed phrases or private keys.</li>
          <li>base2sol does not custody user funds.</li>
          <li>base2sol does not create user accounts.</li>
          <li>base2sol does not sell personal information in this codebase.</li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          base2sol is not intended for children. Do not use the service if you
          are not legally permitted to use blockchain wallets or bridge
          services in your jurisdiction.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For privacy questions about the official base2sol deployment, contact
          the project through GitHub, such as the repository issue tracker or
          discussion area. Operators of independent deployments should provide
          their own contact path before launch.
        </p>
      </section>
    </LegalPage>
  );
}
