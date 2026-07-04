import { PREDICATE_IDS, PREDICATE_ATOM_DATA } from '@0xintuition/predicates'
import { buildCustomPredicateAtom } from '../atoms/builder'
import { getRegistry, storeAtom } from '../graph/registry'
import type { Hex } from 'viem'

export interface PredicateMapping {
  key?: string
  name: string
  id: Hex
  atomData?: string
}

const customPredicateCache = new Map<string, PredicateMapping>()
let cacheLoaded = false

function loadCacheFromRegistry(): void {
  if (cacheLoaded) return
  const registry = getRegistry()
  for (const [predName, id] of Object.entries(registry.customPredicateToId)) {
    const entry = registry.atoms[id]
    if (entry) {
      customPredicateCache.set(predName, {
        name: predName,
        id: id as Hex,
        atomData: entry.data,
      })
    }
  }
  cacheLoaded = true
}

function enshrined(key: string): PredicateMapping {
  const id = PREDICATE_IDS[key as keyof typeof PREDICATE_IDS]
  if (!id) {
    throw new Error(`Enshrined predicate "${key}" not found`)
  }
  const atomData = PREDICATE_ATOM_DATA[key as keyof typeof PREDICATE_ATOM_DATA]
  return { key, name: key, id, atomData }
}

function custom(name: string, description: string): PredicateMapping {
  loadCacheFromRegistry()

  const cached = customPredicateCache.get(name)
  if (cached) return cached

  const { atom, id } = buildCustomPredicateAtom(name, description)
  const mapping: PredicateMapping = { name, id, atomData: atom.data }
  customPredicateCache.set(name, mapping)

  storeAtom(
    {
      id,
      classificationSlug: atom.classificationSlug,
      schemaType: atom.schemaType,
      data: atom.data,
      values: atom.values,
      existsOnchain: atom.existsOnchain,
    },
    undefined,
    undefined,
    undefined,
    name,
  )

  return mapping
}

export function getEnshrinedPredicate(key: string): PredicateMapping {
  return enshrined(key)
}

export function getCustomPredicate(name: string, description: string): PredicateMapping {
  return custom(name, description)
}

export function getAllRequiredPredicates(): PredicateMapping[] {
  return [
    enshrined('vouchFor'),

    custom('contributedTo', 'Indicates that a person contributed to a software repository'),
    custom('authored', 'Indicates that a person authored a specific issue or pull request'),
    custom('mergedBy', 'Indicates that a person merged a pull request'),
    custom('dependsOn', 'Indicates that a software project depends on another project or package'),
    custom('maintainedBy', 'Indicates that a repository is maintained by a person'),
    custom('hasPackage', 'Indicates that a repository has a corresponding npm package'),
    custom('worksAt', 'Indicates that a person works at an organization'),
  ]
}

export function getPredicateByName(name: string): PredicateMapping | undefined {
  try {
    return enshrined(name)
  } catch {
    return customPredicateCache.get(name)
  }
}
