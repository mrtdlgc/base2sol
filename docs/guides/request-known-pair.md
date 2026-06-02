# Request a known pair

Known pairs are convenience presets in the base2sol UI. They make repeat use
easier, but they are not endorsements, security reviews, or a substitute for
checking addresses before signing.

## Before requesting

Run pair verification in the app and collect:

- the Base ERC20 address;
- the Solana mint or native-SOL sentinel;
- Base and Solana decimals;
- the bridge registration or a successful bridge transaction;
- official sources that publish both addresses.

## Open the issue form

After the repository is published on GitHub, open:

```text
Issues -> New issue -> Known pair request
```

The issue form lives at:

```text
.github/ISSUE_TEMPLATE/known-pair.yml
```

Deployments can also set `NEXT_PUBLIC_REPOSITORY_URL` so the app footer and
pair verification panel link directly to the form.

## Review expectations

Maintainers should treat requests as listing reviews, not security audits.

A good request includes official sources, matching decimals, and bridge
registration evidence. Incomplete or stale requests can be rejected, renamed,
or removed from the known-pair list later.
