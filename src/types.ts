import type { Hex } from 'viem'

export interface RepoIdentifier {
  owner: string
  name: string
}

export interface RepoInfo {
  owner: string
  name: string
  fullName: string
  description: string
  url: string
  language: string
  stars: number
}

export interface ContributorInfo {
  login: string
  id: number
  avatarUrl: string
  url: string
  contributions: number
}

export interface PRInfo {
  number: number
  title: string
  url: string
  state: string
  author: ContributorBrief
  mergedBy?: ContributorBrief
  createdAt: string
  mergedAt?: string
}

export interface IssueInfo {
  number: number
  title: string
  url: string
  state: string
  author: ContributorBrief
  createdAt: string
  closedAt?: string
}

export interface ContributorBrief {
  login: string
}

export interface NpmPackageInfo {
  name: string
  version: string
  description: string
  url: string
}

export interface DerivedAtom {
  id: Hex
  classificationSlug: string
  schemaType: string
  data: string
  values: Record<string, unknown>
  existsOnchain: boolean
}

export interface DerivedTriple {
  id: Hex
  subjectId: Hex
  predicateId: Hex
  predicateKey: string
  objectId: Hex
  existsOnchain: boolean
}

export interface AtomEntry {
  id: string
  classificationSlug: string
  schemaType: string
  data: string
  values: Record<string, unknown>
  existsOnchain: boolean
}

export interface TripleEntry {
  id: string
  subjectId: string
  predicateId: string
  predicateKey: string
  objectId: string
  existsOnchain: boolean
}

export interface AtomRegistry {
  atoms: Record<string, AtomEntry>
  githubHandleToId: Record<string, string>
  repoUrlToId: Record<string, string>
  npmPackageToId: Record<string, string>
  customPredicateToId: Record<string, string>
  triples: Record<string, TripleEntry>
}

export interface ContributorReputation {
  atomId: string
  githubHandle: string
  scores: {
    commitDepth: number
    projectDiversity: number
    maintainerTrust: number
    dependencyReach: number
    longevity: number
  }
  trustStakers: string[]
  redFlags: string[]
}

export interface ContributionData {
  repo: RepoInfo
  contributors: ContributorInfo[]
  prs: PRInfo[]
  issues: IssueInfo[]
  npmPackage?: NpmPackageInfo
}
