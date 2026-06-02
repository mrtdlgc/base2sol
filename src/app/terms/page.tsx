import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms for using base2sol, a non-custodial Base to Solana bridge frontend.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" updated="June 2, 2026">
      <section>
        <h2>Agreement</h2>
        <p>
          These Terms govern your use of base2sol, a non-custodial frontend for
          registering Base tokens on Solana and bridging assets between Base and
          Solana. By using base2sol, you agree to these Terms.
        </p>
      </section>

      <section>
        <h2>Non-custodial service</h2>
        <p>
          base2sol does not hold private keys, custody assets, or control user
          wallets. You are responsible for reviewing every wallet prompt before
          signing and for securing your wallets, seed phrases, devices, and RPC
          configuration.
        </p>
      </section>

      <section>
        <h2>No financial advice</h2>
        <p>
          base2sol is software infrastructure. It does not provide investment,
          tax, legal, accounting, or financial advice. Token availability,
          bridge support, presets, and user interface hints are not
          recommendations.
        </p>
      </section>

      <section>
        <h2>User responsibilities</h2>
        <p>You are responsible for:</p>
        <ul>
          <li>verifying token contracts, mints, recipients, and decimals;</li>
          <li>using the correct Base and Solana networks;</li>
          <li>understanding gas, relay fees, and bridge timing;</li>
          <li>complying with laws and rules that apply to you;</li>
          <li>starting with small amounts before moving meaningful value.</li>
        </ul>
      </section>

      <section>
        <h2>Bridge and blockchain risk</h2>
        <p>
          Blockchain transactions are generally irreversible. Bridge operations
          may fail, be delayed, or depend on external protocol state, relayers,
          RPC providers, wallets, smart contracts, token contracts, and network
          conditions. You use base2sol at your own risk.
        </p>
      </section>

      <section>
        <h2>Token registration</h2>
        <p>
          If you register a Base token on Solana, you are responsible for the
          accuracy of the token metadata, decimals, token address, symbol, and
          any public claims you make about the token. base2sol does not verify
          token ownership or endorse tokens registered through the interface.
        </p>
      </section>

      <section>
        <h2>Prohibited use</h2>
        <p>
          You may not use base2sol to violate applicable law, evade sanctions,
          compromise wallets or systems, misrepresent tokens, or interfere with
          the service, bridge contracts, RPC providers, wallets, or other users.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          base2sol depends on wallets, RPC providers, blockchains, explorers,
          bridge contracts, and other third-party systems. Those services are
          governed by their own terms and policies. base2sol is not responsible
          for third-party availability, correctness, fees, or security.
        </p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          base2sol may change, pause, or discontinue features at any time. The
          interface may be updated to reflect bridge protocol changes, security
          findings, operational limits, or product decisions.
        </p>
      </section>

      <section>
        <h2>Disclaimers</h2>
        <p>
          base2sol is provided on an as-is and as-available basis. To the
          maximum extent permitted by law, base2sol disclaims warranties of
          merchantability, fitness for a particular purpose, non-infringement,
          availability, accuracy, and error-free operation.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, base2sol and its contributors
          will not be liable for indirect, incidental, special, consequential,
          exemplary, or punitive damages, or for lost profits, lost data, loss
          of goodwill, wallet compromise, failed transactions, bridge delays, or
          loss of digital assets.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For questions about these Terms for the official base2sol deployment,
          contact the project through GitHub, such as the repository issue
          tracker or discussion area. Operators of independent deployments
          should provide their own contact path before launch.
        </p>
      </section>
    </LegalPage>
  );
}
