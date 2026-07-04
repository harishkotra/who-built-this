import fs from 'fs'
import type { AtomRegistry, AtomEntry, TripleEntry } from '../types'
import { DATA_DIR, REGISTRY_FILE } from '../config'

function defaultRegistry(): AtomRegistry {
  return {
    atoms: {},
    githubHandleToId: {},
    repoUrlToId: {},
    npmPackageToId: {},
    customPredicateToId: {},
    triples: {},
  }
}

let _registry: AtomRegistry | null = null

export function getRegistry(): AtomRegistry {
  if (_registry) return _registry

  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8')
      _registry = JSON.parse(raw) as AtomRegistry
      return _registry
    } catch {
      console.warn('Failed to parse registry, starting fresh')
    }
  }

  _registry = defaultRegistry()
  return _registry
}

export function persistRegistry(): void {
  if (!_registry) return
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(_registry, null, 2), 'utf-8')
}

export function lookupByGithubHandle(handle: string): AtomEntry | undefined {
  const id = getRegistry().githubHandleToId[handle.toLowerCase()]
  if (!id) return undefined
  return getRegistry().atoms[id]
}

export function lookupByRepoUrl(url: string): AtomEntry | undefined {
  const id = getRegistry().repoUrlToId[url.toLowerCase()]
  if (!id) return undefined
  return getRegistry().atoms[id]
}

export function lookupByNpmPackage(name: string): AtomEntry | undefined {
  const id = getRegistry().npmPackageToId[name.toLowerCase()]
  if (!id) return undefined
  return getRegistry().atoms[id]
}

export function storeAtom(
  entry: AtomEntry,
  githubHandle?: string,
  repoUrl?: string,
  npmPackageName?: string,
  predicateName?: string,
): void {
  const registry = getRegistry()
  registry.atoms[entry.id] = entry

  if (githubHandle) {
    registry.githubHandleToId[githubHandle.toLowerCase()] = entry.id
  }
  if (repoUrl) {
    registry.repoUrlToId[repoUrl.toLowerCase()] = entry.id
  }
  if (npmPackageName) {
    registry.npmPackageToId[npmPackageName.toLowerCase()] = entry.id
  }
  if (predicateName) {
    registry.customPredicateToId[predicateName] = entry.id
  }
}

export function storeTriple(entry: TripleEntry): void {
  getRegistry().triples[entry.id] = entry
}

export function getAtomById(id: string): AtomEntry | undefined {
  return getRegistry().atoms[id]
}

export function getTripleById(id: string): TripleEntry | undefined {
  return getRegistry().triples[id]
}

export function markAtomOnchain(id: string): void {
  const entry = getRegistry().atoms[id]
  if (entry) {
    entry.existsOnchain = true
  }
}

export function markTripleOnchain(id: string): void {
  const entry = getRegistry().triples[id]
  if (entry) {
    entry.existsOnchain = true
  }
}

export function getAllPersonAtoms(): AtomEntry[] {
  return Object.values(getRegistry().atoms).filter(a => a.classificationSlug === 'person')
}

export function getAllRepoAtoms(): AtomEntry[] {
  return Object.values(getRegistry().atoms).filter(a => a.classificationSlug === 'software')
}

export function getAllTriples(): TripleEntry[] {
  return Object.values(getRegistry().triples)
}
