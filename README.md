# Who Built This?

> **An onchain reputation graph for open source contributors.**
>
> Every GitHub repo, contributor, issue, PR, and npm package becomes an **atom** on the Intuition blockchain. Relationships between them — "who contributed to what", "who merged that PR", "what does this package depend on" — become **triples**. All identities are deterministic (offchain-derivable atom IDs). All data is verifiable onchain.

---

## Why This Exists

Open source contributions are scattered across platforms — GitHub, npm, GitLab, etc. There's no unified, portable, platform-agnostic way to prove "I contributed to these 50 repos" or "this person maintains 12 core dependencies."

**Who Built This?** solves this by mapping the OSS ecosystem into the Intuition knowledge graph:

- **Deterministic IDs** — the same GitHub handle always maps to the same onchain atom (derived locally, no lookups needed)
- **Portable** — atom IDs are derived from canonicalized data, not assigned by a central authority
- **Verifiable** — all data lives on Intuition testnet (and eventually mainnet)
- **Extensible** — anyone can build new predicates, scoring algorithms, or frontends on top

---

## Table of Contents

- [Who Built This?](#who-built-this)
  - [Why This Exists](#why-this-exists)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
    - [Onchain Publishing](#onchain-publishing)
  - [Architecture](#architecture)
    - [Atom Creation Flow](#atom-creation-flow)
    - [Onchain Publishing](#onchain-publishing-1)
    - [Triple Graph Building](#triple-graph-building)
  - [CLI Commands](#cli-commands)
    - [Reputation Scoring](#reputation-scoring)
  - [Web Explorer](#web-explorer)
  - [Project Structure](#project-structure)
  - [Technologies](#technologies)
  - [Environment Variables](#environment-variables)
  - [Contributing](#contributing)
    - [How to Contribute](#how-to-contribute)
    - [Ideas for New Features](#ideas-for-new-features)
    - [Code Conventions](#code-conventions)
  - [What's Next](#whats-next)

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/harishkotra/who-built-this.git
cd who-built-this
npm install

# Ingest a repo (offline — derive atoms locally, no blockchain needed)
npm run ingest -- --repo prettier/prettier

# Check the derived atoms and triples
cat data/atom-registry.json

# View a contributor's reputation
npm run profile -- --user fisker

# Compare contributors
npm run compare -- --users fisker,jlongster

# Show the dependency graph
npm run deps -- --repo prettier/prettier
```

### Onchain Publishing

```bash
# 1. Copy the env template and add your private key
cp .env.example .env
# Edit .env → add PRIVATE_KEY (your wallet's private key with 0x prefix)
# Add GITHUB_TOKEN for higher API rate limits

# 2. Publish a repo's graph onchain
npm run ingest -- --repo harishkotra/agent-office --publish
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI (index.ts)                           │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ ingest   │   │ profile      │   │ compare / deps / vouch │  │
│  │          │   │              │   │                        │  │
│  │ ┌──────┐ │   │ ┌──────────┐│   │ ┌────────────────────┐ │  │
│  │ │GitHub│ │   │ │Registry  ││   │ │ Registry lookups   │ │  │
│  │ │API   │ │   │ │queries   ││   │ │ + reputation calc  │ │  │
│  │ │npm   │ │   │ │          ││   │ └────────────────────┘ │  │
│  │ │API   │ │   │ └──────────┘│   │                        │  │
│  │ └──────┘ │   └──────────────┘   └────────────────────────┘  │
│  └──────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Pipeline (ingest/pipeline.ts)               │
│                                                                 │
│  Stage 1          Stage 2          Stage 3          Stage 4     │
│ ┌──────────┐   ┌────────────┐   ┌────────────┐   ┌──────────┐ │
│ │ Fetch    │ → │ Canonicalize│ → │ Derive IDs │ → │Dedup     │ │
│ │ GitHub + │   │ URLs &      │   │ (offchain, │   │against   │ │
│ │ npm data │   │ build atoms │   │  free)     │   │onchain   │ │
│ └──────────┘   └────────────┘   └────────────┘   └──────────┘ │
│                                                      │         │
│  Stage 5          Stage 6                            ▼         │
│ ┌────────────┐   ┌────────────────────┐   ┌──────────────────┐ │
│ │ Build      │ → │ Publish (opt-in)   │   │ Local Registry   │ │
│ │ Triple     │   │ via multiVault     │   │ (data/registry)  │ │
│ │ Graph      │   │ createAtoms/Triples│   │                  │ │
│ └────────────┘   └────────────────────┘   └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│     Intuition Testnet       │    │   Web Explorer (read-only)  │
│  (chain 13579, MultiVault)  │    │                             │
│                             │    │  Queries Intuition GraphQL  │
│  Onchain Atoms + Triples    │    │  API → displays your data   │
│  + vault deposits           │    │  in browser                 │
└─────────────────────────────┘    └─────────────────────────────┘
```

### Atom Creation Flow

```typescript
// Each entity gets a deterministic atom ID derived from its canonicalized data
import { buildAtom } from '@0xintuition/primitives'

// A contributor
const person = buildAtom('person', {
  givenName: 'fisker',
  familyName: 'fisker',
  sameAs: ['https://github.com/fisker'],
})
// person.id → deterministic 32-byte hex ID (no onchain call needed)

// A repository
const repo = buildAtom('software', {
  name: 'prettier',
  codeRepository: 'https://github.com/prettier/prettier',
  sameAs: ['https://github.com/prettier/prettier'],
})

// A relationship (triple) between them
import { calculateTripleId } from '@0xintuition/ids'

const tripleId = calculateTripleId(person.id, contributedToPredicate.id, repo.id)
```

### Onchain Publishing

```typescript
// Publishing uses the @0xintuition/protocol package
import { multiVaultCreateAtoms, multiVaultGetAtomCost } from '@0xintuition/protocol'
import { getMultiVaultAddressFromChainId } from '@0xintuition/deployments'

const multiVaultAddress = getMultiVaultAddressFromChainId(13579) // Intuition Testnet
const atomCost = await multiVaultGetAtomCost({ address: multiVaultAddress, publicClient })

const txHash = await multiVaultCreateAtoms(
  { address: multiVaultAddress, walletClient, publicClient },
  {
    args: [[atomUri1, atomUri2], [atomCost, atomCost]], // data + deposits
    value: atomCost * 2n, // total ETH to send
  }
)
```

### Triple Graph Building

```typescript
// Predicates connect entities
const predicates = {
  contributedTo: { subject: 'person', object: 'repo' },
  authored:      { subject: 'person', object: 'issue/PR' },
  mergedBy:      { subject: 'person', object: 'PR' },
  maintainedBy:  { subject: 'repo',   object: 'person' },
  hasPackage:    { subject: 'repo',   object: 'npm package' },
  worksAt:       { subject: 'person', object: 'org' },
}
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `ingest --repo owner/repo [--publish] [--offline]` | Ingest a repo: fetch all contributors, PRs, issues, npm data. Derive atoms. Optionally publish onchain. |
| `profile --user handle` | Show a contributor's reputation summary |
| `compare --users alice,bob` | Compare reputation across contributors |
| `deps --repo owner/repo` | Show the dependency/maintainer graph |
| `vouch --for handle --from 0xAddr` | Write a vouchFor triple onchain |
| `export --user handle` | Export reputation as JSON |

### Reputation Scoring

All scores are computed locally from the graph — no onchain calls needed.

| Score | Description |
|-------|-------------|
| **Commit Depth** | Total PRs merged + issues/PRs authored |
| **Project Diversity** | Number of unique repos contributed to |
| **Maintainer Trust** | Number of people who've vouched for this contributor |
| **Dependency Reach** | Downstream repos depending on maintained projects |
| **Longevity** | Days since oldest contribution |

---

## Web Explorer

The `web/` directory contains a read-only explorer that queries the Intuition GraphQL API:

```
https://who-built-this.vercel.app
```

Deploy your own instance:

```bash
cd web/
npx vercel --prod
```

The explorer:
- Shows only atoms/triples published by your wallet (filtered by `creator_id`)
- Search by label or atom ID
- Click any atom to see its relationships
- No wallet connection needed — read-only

---

## Project Structure

```
who-built-this/
├── index.ts                  # Entry point (re-exports src/)
├── src/
│   ├── index.ts              # CLI dispatcher
│   ├── config.ts             # Env vars, constants
│   ├── types.ts              # TypeScript types
│   ├── cli/
│   │   └── commands.ts       # Command handlers
│   ├── ingest/
│   │   ├── pipeline.ts       # Main ingest pipeline
│   │   ├── github.ts         # GitHub REST API client
│   │   └── npm.ts            # npm Registry API client
│   ├── atoms/
│   │   └── builder.ts        # Atom construction helpers
│   ├── graph/
│   │   ├── onchain.ts        # Blockchain publishing logic
│   │   ├── registry.ts       # Local atom/triple registry
│   │   └── dedup.ts          # Deduplication against onchain
│   ├── predicates/
│   │   └── vocabulary.ts     # Predicate definitions
│   ├── reputation/
│   │   └── scoring.ts        # Reputation score computation
│   └── utils/
│       └── canonicalize.ts   # URL canonicalization
├── web/
│   └── index.html            # Read-only explorer (deployed to Vercel)
├── data/                     # Local registry (gitignored)
├── vercel.json               # Vercel deployment config
└── package.json
```

---

## Technologies

| Layer | Technology |
|-------|-----------|
| **Runtime** | [Bun](https://bun.sh) / Node.js (npm scripts use `bun`) |
| **Language** | TypeScript (ESM, strict mode) |
| **Blockchain** | [viem](https://viem.sh) — wallet clients, contract interactions |
| **Protocol** | [@0xintuition/protocol](https://www.npmjs.com/package/@0xintuition/protocol) — `multiVaultCreateAtoms`, `multiVaultCreateTriples` |
| **Primitives** | [@0xintuition/primitives](https://www.npmjs.com/package/@0xintuition/primitives) — `buildAtom`, `buildCustomPredicate` |
| **IDs** | [@0xintuition/ids](https://www.npmjs.com/package/@0xintuition/ids) — `calculateTripleId`, `calculateAtomId` |
| **Predicates** | [@0xintuition/predicates](https://www.npmjs.com/package/@0xintuition/predicates) — enshrined predicate IDs |
| **Chain** | Intuition Testnet (id: 13579) / Intuition Mainnet (id: 1155) |
| **GraphQL API** | Hasura — `https://testnet.intuition.sh/v1/graphql` |
| **Block Explorer** | [testnet.explorer.intuition.systems](https://testnet.explorer.intuition.systems) |
| **Frontend** | Vanilla HTML/CSS/JS (static, no framework) |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Recommended | — | GitHub personal access token (higher API rate limits) |
| `PRIVATE_KEY` | For `--publish` | — | Wallet private key with `0x` prefix |
| `INTUITION_RPC_URL` | No | `https://testnet.rpc.intuition.systems/http` | RPC endpoint |

Copy `.env.example` → `.env` and fill in your values.

---

## Contributing

This is an open source project. Contributions of all kinds are welcome.

### How to Contribute

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run the type checker (`npx tsc --noEmit`)
5. Test with a small repo (`npm run ingest -- --repo prettier/prettier`)
6. Commit and push
7. Open a pull request

### Ideas for New Features

| Feature | Difficulty | Description |
|---------|-----------|-------------|
| **GitLab support** | Medium | Add a GitLab API client alongside the GitHub one. Same atom schema, different data source. |
| **npm dependents graph** | Medium | Fetch downstream dependents of published packages and publish `dependsOn` triples. |
| **Reputation leaderboard** | Medium | Aggregate all published data via the GraphQL API and rank contributors globally. |
| **GitHub Actions integration** | Easy | A GitHub Action that auto-publishes repository metadata on push. |
| **Multi-chain support** | Hard | Publish to Intuition mainnet, or use a bridge to post atoms on multiple chains. |
| **Wallet-based vouch UI** | Medium | Extend the web explorer with a "vouch" button that connects MetaMask and writes a `vouchFor` triple. |
| **Social preview cards** | Easy | Generate OG image for each contributor showing their reputation scores. |
| **Scheduled re-ingest** | Medium | Cron job that re-ingests previously published repos to pick up new contributors/PRs. |
| **Custom scoring plugins** | Medium | Allow users to define their own reputation algorithm via a plugin interface. |

### Code Conventions

- Strict TypeScript with ESM imports
- No classes — prefer pure functions and async/await
- Exported functions for testability
- Errors are caught and displayed with `.message` at the CLI level
- Atom data uses schema.org JSON-LD

---

## What's Next

- [ ] Intuition Mainnet support
- [ ] `dependsOn` triple publishing for npm dependency graphs
- [ ] GitHub Actions auto-publisher
- [ ] Wallet-connected vouch UI
- [ ] Reputation leaderboard web page