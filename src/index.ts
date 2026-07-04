#!/usr/bin/env bun
import { handleIngest, handleProfile, handleCompare, handleDeps, handleVouch, handleExport } from './cli/commands'

const [cmd, ...args] = process.argv.slice(2)

async function main() {
  switch (cmd) {
    case 'ingest':
      await handleIngest(args)
      break
    case 'profile':
      await handleProfile(args)
      break
    case 'compare':
      await handleCompare(args)
      break
    case 'deps':
      await handleDeps(args)
      break
    case 'vouch':
      await handleVouch(args)
      break
    case 'export':
      await handleExport(args)
      break
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      break
    default:
      if (cmd) {
        console.error(`Unknown command: ${cmd}`)
      }
      printHelp()
      process.exit(1)
  }
}

function printHelp() {
  console.log([
    '',
    'Who Built This? -- Open Source Reputation Graph on Intuition',
    '',
    'USAGE',
    '  bun run index.ts <command> [options]',
    '',
    'COMMANDS',
    '  ingest              Ingest a repo and build its reputation graph',
    '    --repo owner/repo   Repository to ingest (required)',
    '    --publish           Publish atoms and triples onchain',
    '    --offline           Derive IDs locally only, no onchain checks',
    '',
    '  profile             Show reputation profile for a GitHub user',
    '    --user handle       GitHub username (required)',
    '',
    '  compare             Compare two or more contributors',
    '    --users alice,bob   Comma-separated GitHub usernames (required)',
    '',
    '  deps                Show dependency graph for a repo',
    '    --repo owner/repo   Repository to inspect (required)',
    '',
    '  vouch               Vouch for a contributor (onchain)',
    '    --for handle        GitHub handle being vouched for (required)',
    '    --from 0xAddr       Your wallet address (required)',
    '',
    '  export              Export reputation data as JSON',
    '    --user handle       GitHub username (required)',
    '    --format json       Output format (default: json)',
    '',
    '  help                Show this help message',
    '',
    'ENVIRONMENT',
    '  All variables can be set in a .env file (copy from .env.example)',
    '  GITHUB_TOKEN       GitHub API token (recommended for higher rate limits)',
    '  PRIVATE_KEY        Ethereum private key for onchain operations (without 0x prefix)',
    '  INTUITION_RPC_URL  Intuition Testnet RPC URL (default: https://testnet.rpc.intuition.systems/http)',
    '',
    'CHAIN',
    '  Onchain operations run on Intuition Testnet (chain 13579) by default.',
    '',
  ].join('\n'))
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
