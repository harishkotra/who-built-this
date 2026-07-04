# Who Built This?

A portable, onchain reputation graph for open source contributors built on the [Intuition protocol](https://intuition.systems). Connects GitHub repos, npm packages, contributors, issues, and PRs using deterministic atom IDs and enshrined predicates — making OSS reputation verifiable, stakeable, and platform-agnostic.

## Quick Start

```bash
# Install dependencies
bun install

# Ingest a repo and build its reputation graph (offline)
bun run index.ts ingest --repo prettier/prettier

# Show a contributor's reputation profile
bun run index.ts profile --user fisker

# Compare multiple contributors
bun run index.ts compare --users fisker,jlongster,vjeux

# Show dependency graph for a repo
bun run index.ts deps --repo prettier/prettier
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `ingest --repo owner/repo [--publish] [--offline]` | Ingest a repo, its contributors, PRs, issues, and npm package. Derives deterministic atom IDs for every entity. Add `--publish` to write atoms and triples onchain. |
| `profile --user handle` | Show a contributor's reputation summary (commit depth, project diversity, maintainer trust, etc.) |
| `compare --users alice,bob` | Compare reputation scores of multiple contributors |
| `deps --repo owner/repo` | Show the dependency/maintainer graph for a previously ingested repo |
| `vouch --for handle --from 0xAddr` | Write a `vouchFor` triple onchain (requires `PRIVATE_KEY`) |
| `export --user handle` | Export reputation data as JSON |

## Architecture

### Atom Types (Classification Schemas)

| Entity | Classification Slug | Schema.org Type | Key Fields |
|--------|-------------------|-----------------|------------|
| Contributor | `person` | Person | `givenName`, `familyName`, `sameAs` |
| Repository | `software` | SoftwareSourceCode | `name`, `codeRepository`, `sameAs` |
| npm Package | `software-application` | SoftwareApplication | `name`, `url`, `sameAs` |
| Issue / PR | `article` | Article | `headline`, `url`, `sameAs` |
| Organization | `company` | Organization | `name`, `url`, `sameAs` |

### Predicate Vocabulary

**Enshrined predicates** (from `@0xintuition/predicates`):
- `vouchFor` — trust delegation between people

**Custom predicates** (created as `DefinedTerm` atoms):
| Predicate | Subject | Object | Description |
|-----------|---------|--------|-------------|
| `contributedTo` | Person | Repo | Core contribution signal |
| `authored` | Person | Issue/PR | Specific contribution |
| `mergedBy` | Person | PR | Reviewer/merger signal |
| `maintainedBy` | Repo | Person | Active maintainer |
| `hasPackage` | Repo | npm Package | Connects repo to registry |
| `worksAt` | Person/Org | Repo | Context for contributions |

### Data Pipeline

1. **Fetch & Normalize** — GitHub REST API + npm Registry API
2. **Canonicalize** — Strip tracking params, resolve canonical URLs, build `sameAs` arrays
3. **Derive Atom IDs** — Use `calculateAtomId` from `@0xintuition/ids` (offchain, free)
4. **Deduplicate** — Check graph for existing atoms before creating
5. **Build Triple Graph** — Connect entities using predicate vocabulary
6. **Publish** (opt-in) — Batch write atoms and triples onchain via `multiVaultCreateAtoms` / `multiVaultCreateTriples`

### Reputation Scoring

Scores are computed locally from the graph structure:

- **Commit Depth** — PRs merged + issues/PRs authored
- **Project Diversity** — Unique repos contributed to
- **Maintainer Trust** — Number of `vouchFor` stakers
- **Dependency Reach** — Downstream repos depending on maintained projects
- **Longevity** — Age of oldest contribution

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Recommended | — | GitHub API token (higher rate limits) |
| `PRIVATE_KEY` | For onchain | — | Ethereum private key (without 0x prefix) |
| `INTUITION_RPC_URL` | No | `https://testnet.rpc.intuition.systems/http` | Intuition Testnet RPC |

## Local Atom Registry

All derived atom IDs and triple IDs are cached in `data/atom-registry.json`. This file serves as the local graph database and is checked before any onchain operation to avoid redundant writes.

## Testing

```bash
# Ingest a small repo to verify the full pipeline
bun run index.ts ingest --repo prettier/prettier

# Verify profile works
bun run index.ts profile --user fisker

# The big test
bun run index.ts ingest --repo vercel/next.js --offline
```

## Dependencies

- **Runtime:** Bun
- **Language:** TypeScript (ESM)
- **Intuition:** `@0xintuition/primitives`, `@0xintuition/protocol`, `@0xintuition/deployments`, `@0xintuition/ids`, `@0xintuition/classifications`, `@0xintuition/predicates`
- **Blockchain:** viem
- **External APIs:** GitHub REST API, npm Registry API
- **Chain:** Intuition Testnet (chain ID 13579, default) — configure for mainnet in `config.ts`
