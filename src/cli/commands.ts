import type { Hex } from 'viem'
import { createWalletClient, createPublicClient, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { intuitionTestnet } from '@0xintuition/deployments'
import { getMultiVaultAddressFromChainId } from '@0xintuition/deployments'
import { multiVaultCreateTriples } from '@0xintuition/protocol'
import { INTUITION_CHAIN_ID, INTUITION_RPC_URL, PRIVATE_KEY } from '../config'
import { ingestRepo } from '../ingest/pipeline'
import { lookupByGithubHandle, getAllPersonAtoms, getAllRepoAtoms, getAllTriples, getAtomById } from '../graph/registry'
import { deriveTriple } from '../atoms/builder'
import { getEnshrinedPredicate } from '../predicates/vocabulary'
import { computeReputation } from '../reputation/scoring'
import type { AtomEntry } from '../types'

function displayName(entry?: AtomEntry): string {
  if (!entry) return 'unknown'
  if (entry.classificationSlug === 'person') return String(entry.values.givenName ?? 'unknown')
  return String(entry.values.name ?? entry.values.headline ?? 'unknown')
}

export async function handleIngest(args: string[]): Promise<void> {
  const repoArg = extractArg(args, '--repo')
  const publish = args.includes('--publish')
  const offline = args.includes('--offline')

  if (!repoArg) {
    console.error('Usage: bun run index.ts ingest --repo owner/repo-name [--publish] [--offline]')
    process.exit(1)
  }

  const match = repoArg.match(/^([^/]+)\/([^/]+)$/)
  if (!match) {
    console.error('Invalid repo format. Use owner/repo-name')
    process.exit(1)
  }

  const [, owner, repoName] = match
  await ingestRepo(owner, repoName, publish, offline)
}

export async function handleProfile(args: string[]): Promise<void> {
  const user = extractArg(args, '--user')

  if (!user) {
    console.error('Usage: bun run index.ts profile --user githubhandle')
    process.exit(1)
  }

  try {
    const rep = computeReputation(user)
    console.log(`\n=== Reputation Profile: ${rep.githubHandle} ===`)
    console.log(`Atom ID:         ${rep.atomId}`)
    console.log(`Commit Depth:    ${rep.scores.commitDepth} (PRs merged + issues/PRs authored)`)
    console.log(`Project Diversity: ${rep.scores.projectDiversity} unique repos`)
    console.log(`Maintainer Trust:  ${rep.scores.maintainerTrust} stakers`)
    console.log(`Dependency Reach:  ${rep.scores.dependencyReach} downstream deps`)
    console.log(`Longevity:       ${rep.scores.longevity} days`)
    if (rep.trustStakers.length > 0) {
      console.log(`Trusted by:      ${rep.trustStakers.map(id => shortenId(id)).join(', ')}`)
    }
    if (rep.redFlags.length > 0) {
      console.log(`Red Flags:       ${rep.redFlags.join(', ')}`)
    }
  } catch (err) {
    console.error(`Profile error: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

export async function handleCompare(args: string[]): Promise<void> {
  const usersArg = extractArg(args, '--users')

  if (!usersArg) {
    console.error('Usage: bun run index.ts compare --users alice,bob')
    process.exit(1)
  }

  const users = usersArg.split(',').map(u => u.trim())
  if (users.length < 2) {
    console.error('Need at least 2 users to compare')
    process.exit(1)
  }

  console.log('\n=== Reputation Comparison ===')
  for (const user of users) {
    try {
      const rep = computeReputation(user)
      console.log(`\n--- ${rep.githubHandle} ---`)
      console.log(`  Atom ID:           ${shortenId(rep.atomId)}`)
      console.log(`  Commit Depth:      ${rep.scores.commitDepth}`)
      console.log(`  Project Diversity: ${rep.scores.projectDiversity}`)
      console.log(`  Maintainer Trust:  ${rep.scores.maintainerTrust}`)
      console.log(`  Dependency Reach:  ${rep.scores.dependencyReach}`)
      console.log(`  Longevity:         ${rep.scores.longevity} days`)
      if (rep.redFlags.length > 0) {
        console.log(`  Red Flags:         ${rep.redFlags.join(', ')}`)
      }
    } catch (err) {
      console.log(`\n--- ${user} ---`)
      console.log(`  Error: ${err instanceof Error ? err.message : err}`)
    }
  }
}

export async function handleDeps(args: string[]): Promise<void> {
  const repoArg = extractArg(args, '--repo')

  if (!repoArg) {
    console.error('Usage: bun run index.ts deps --repo owner/repo-name')
    process.exit(1)
  }

  const repoUrl = `https://github.com/${repoArg}`
  const allRepos = getAllRepoAtoms()
  const repoEntry = allRepos.find(r => (r.values.codeRepository as string)?.toLowerCase() === repoUrl.toLowerCase())

  if (!repoEntry) {
    console.log(`No data for ${repoArg}. Ingest it first.`)
    return
  }

  console.log(`\n=== Dependency Graph: ${repoArg} ===`)
  console.log(`Atom ID: ${repoEntry.id}`)

  const allTriples = getAllTriples()

  const maintainedBy = allTriples.filter(
    t => t.subjectId === repoEntry.id && t.predicateKey === 'maintainedBy',
  )
  const dependsOn = allTriples.filter(
    t => t.subjectId === repoEntry.id && t.predicateKey === 'dependsOn',
  )
  const hasPackage = allTriples.filter(
    t => t.subjectId === repoEntry.id && t.predicateKey === 'hasPackage',
  )
  const contributedTo = allTriples.filter(
    t => t.objectId === repoEntry.id && t.predicateKey === 'contributedTo',
  )

  console.log(`\nMaintainers:`)
  for (const t of maintainedBy) {
    console.log(`  ${displayName(getAtomById(t.objectId))}`)
  }

  console.log(`\nContributors (${contributedTo.length}):`)
  for (const t of contributedTo) {
    console.log(`  ${displayName(getAtomById(t.subjectId))}`)
  }

  if (hasPackage.length > 0) {
    console.log(`\npm Package:`)
    for (const t of hasPackage) {
      console.log(`  ${displayName(getAtomById(t.objectId))}`)
    }
  }
}

export async function handleVouch(args: string[]): Promise<void> {
  const vouchFor = extractArg(args, '--for')
  const vouchFrom = extractArg(args, '--from')

  if (!vouchFor || !vouchFrom) {
    console.error('Usage: bun run index.ts vouch --for githubhandle --from 0xYourAddress')
    process.exit(1)
  }

  const targetEntry = lookupByGithubHandle(vouchFor)
  if (!targetEntry) {
    console.error(`No atom found for GitHub handle: ${vouchFor}. Ingest their data first.`)
    process.exit(1)
  }

  if (!PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable required for onchain transactions')
    process.exit(1)
  }

  console.log(`\n=== Vouching for ${vouchFor} ===`)
  console.log(`Target atom:  ${targetEntry.id}`)

  const vouchPred = getEnshrinedPredicate('vouchFor')

  const account = privateKeyToAccount(PRIVATE_KEY)

  const walletClient = createWalletClient({
    account,
    chain: intuitionTestnet,
    transport: http(INTUITION_RPC_URL),
  })
  const publicClient = createPublicClient({
    chain: intuitionTestnet,
    transport: http(INTUITION_RPC_URL),
  })
  const multiVaultAddress = getMultiVaultAddressFromChainId(INTUITION_CHAIN_ID)

  const pairId = vouchFrom as Hex
  const tripleId = deriveTriple(pairId, vouchPred, targetEntry.id as Hex)

  console.log(`Vouch triple:  ${tripleId.id}`)
  console.log('Writing vouchFor triple onchain...')

  try {
    const txHash = await multiVaultCreateTriples(
      { address: multiVaultAddress, walletClient, publicClient },
      {
        args: [[pairId], [vouchPred.id], [targetEntry.id as Hex], [parseEther('0.0001')]],
        value: parseEther('0.0001'),
      },
    )
    console.log(`Transaction: ${txHash}`)
    console.log('Vouch registered onchain.')
  } catch (err) {
    console.error(`Failed to vouch: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

export async function handleExport(args: string[]): Promise<void> {
  const user = extractArg(args, '--user')
  const format = extractArg(args, '--format') ?? 'json'

  if (!user) {
    console.error('Usage: bun run index.ts export --user githubhandle [--format json]')
    process.exit(1)
  }

  try {
    const rep = computeReputation(user)
    if (format === 'json') {
      console.log(JSON.stringify(rep, null, 2))
    } else {
      console.log('Only JSON format is currently supported')
    }
  } catch (err) {
    console.error(`Export error: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

function extractArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

function shortenId(id: string): string {
  if (id.length <= 16) return id
  return `${id.slice(0, 8)}...${id.slice(-6)}`
}
