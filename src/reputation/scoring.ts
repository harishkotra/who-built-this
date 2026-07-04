import type { ContributorReputation, DerivedTriple, AtomEntry, TripleEntry } from '../types'
import { getAllPersonAtoms, getAllTriples, getAllRepoAtoms, getAtomById } from '../graph/registry'

export function computeReputation(githubHandle: string): ContributorReputation {
  const personEntry = getAllPersonAtoms().find(
    p => (p.values.givenName as string)?.toLowerCase() === githubHandle.toLowerCase(),
  )
  if (!personEntry) {
    throw new Error(`No data found for GitHub user: ${githubHandle}. Ingest their repos first.`)
  }

  const allTriples = getAllTriples()
  const allPeople = getAllPersonAtoms()
  const allRepos = getAllRepoAtoms()

  const personTriples = allTriples.filter(
    t => t.subjectId === personEntry.id || t.objectId === personEntry.id,
  )

  const contributedRepos = new Set<string>()
  const authoredItems = new Set<string>()
  const mergedPRs = new Set<string>()
  const stakers: string[] = []

  for (const t of personTriples) {
    if (t.predicateKey === 'contributedTo' && t.subjectId === personEntry.id) {
      contributedRepos.add(t.objectId)
    }
    if (t.predicateKey === 'authored' && t.subjectId === personEntry.id) {
      authoredItems.add(t.objectId)
    }
    if (t.predicateKey === 'mergedBy' && t.subjectId === personEntry.id) {
      mergedPRs.add(t.objectId)
    }
    if (t.predicateKey === 'vouchFor' && t.objectId === personEntry.id) {
      stakers.push(t.subjectId)
    }
  }

  const maintainedRepoIds = new Set<string>()
  for (const t of allTriples) {
    if (t.predicateKey === 'maintainedBy' && t.objectId === personEntry.id) {
      maintainedRepoIds.add(t.subjectId)
    }
  }

  let dependencyReach = 0
  for (const repoId of maintainedRepoIds) {
    for (const t of allTriples) {
      if (t.predicateKey === 'dependsOn' && t.subjectId === repoId) {
        dependencyReach++
      }
    }
  }

  const createdTriples = personTriples.filter(t => t.subjectId === personEntry.id)
  const createdDates = createdTriples
    .map(() => Date.now())
    .sort()

  const oldestContribution = createdDates.length > 0
    ? createdDates[0]
    : Date.now()
  const longevityDays = Math.round((Date.now() - oldestContribution) / (1000 * 60 * 60 * 24))

  const commitDepth = mergedPRs.size + authoredItems.size
  const projectDiversity = contributedRepos.size

  const redFlags: string[] = []

  if (contributedRepos.size <= 1 && allRepos.length > 0) {
    redFlags.push('100% contributions to own repos only')
  }

  return {
    atomId: personEntry.id,
    githubHandle,
    scores: {
      commitDepth,
      projectDiversity,
      maintainerTrust: stakers.length,
      dependencyReach,
      longevity: longevityDays,
    },
    trustStakers: stakers,
    redFlags,
  }
}
