import { config as dotenvConfig } from 'dotenv'
import path from 'path'

dotenvConfig()

export const INTUITION_CHAIN_ID = 13579

export const INTUITION_RPC_URL = process.env.INTUITION_RPC_URL ?? 'https://testnet.rpc.intuition.systems/http'

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
export const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined

export const DATA_DIR = path.join(process.cwd(), 'data')
export const REGISTRY_FILE = path.join(DATA_DIR, 'atom-registry.json')
export const DEFAULT_PR_LIMIT = 100
export const DEFAULT_ISSUE_LIMIT = 100

export const GITHUB_API_BASE = 'https://api.github.com'
export const NPM_API_BASE = 'https://registry.npmjs.org'

export const CUSTOM_PREDICATES = {
  contributedTo: { name: 'contributedTo', description: 'Indicates that a person contributed to a software repository' },
  authored: { name: 'authored', description: 'Indicates that a person authored a specific issue or pull request' },
  mergedBy: { name: 'mergedBy', description: 'Indicates that a person merged a pull request' },
  dependsOn: { name: 'dependsOn', description: 'Indicates that a software project depends on another project or package' },
  maintainedBy: { name: 'maintainedBy', description: 'Indicates that a repository is maintained by a person' },
  hasPackage: { name: 'hasPackage', description: 'Indicates that a repository has a corresponding npm package' },
  worksAt: { name: 'worksAt', description: 'Indicates that a person works at an organization' },
} as const
