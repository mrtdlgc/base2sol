# Run and deploy

base2sol is a Next.js app with no backend service.

The production build creates a static/server bundle that can run in Docker,
Coolify, or any Node host that supports Next standalone output.

## Local development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Type checking

```bash
npm run typecheck
```

Use this as the local correctness gate.

## Production build

```bash
npm run build
```

On this Windows development host, Next can compile successfully and then fail
with `spawn EPERM` while spawning a worker. That is an environment issue, not a
TypeScript compile failure. Linux builds, including Docker and Coolify builds,
use a different worker path.

## Docker

Build:

```bash
docker build -t base2sol .
```

Run:

```bash
docker run --rm -p 3000:3000 base2sol
```

The Dockerfile:

- installs dependencies with `npm ci`;
- builds the vendored bridge SDK;
- runs the Next production build;
- starts the standalone server on port `3000`.

## Coolify

Recommended settings:

| Setting | Value |
| --- | --- |
| Build Pack | Dockerfile |
| Port | 3000 |
| Health check path | `/` |

Set RPC defaults as build variables if you want deployed defaults to differ from
the repository defaults.

Set `NEXT_PUBLIC_SITE_URL=https://base2sol.xyz` as a build variable for the
official deployment so canonical URLs and social previews use the production
domain.

Set `NEXT_PUBLIC_REPOSITORY_URL=https://github.com/YOUR_ORG/YOUR_REPO` after
the repository exists. When this is present, the app links users to the
`Known pair request` GitHub issue form.

## Vendored SDK

The app depends on:

```json
"bridge-sdk": "file:./vendor/bridge-sdk"
```

If you change files inside `vendor/bridge-sdk/src`, rebuild the SDK:

```bash
npm --prefix vendor/bridge-sdk run build
```

Then run:

```bash
npm run typecheck
```
