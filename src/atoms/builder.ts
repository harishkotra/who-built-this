import { buildAtom, buildCustomPredicate } from '@0xintuition/primitives'
import { calculateTripleId } from '@0xintuition/ids'
import type { Hex } from 'viem'
import type { DerivedAtom, DerivedTriple } from '../types'
import { canonicalGitHubProfileUrl, canonicalNpmProfileUrl, canonicalRepoUrl } from '../utils/canonicalize'
import type { PredicateMapping } from '../predicates/vocabulary'

function mustBuildAtom(slug: string, values: Record<string, unknown>): DerivedAtom {
  const result = buildAtom(slug, values)
  if (!result.success) {
    throw new Error(`Failed to build ${slug} atom: ${result.errors.join(', ')}`)
  }
  return {
    id: result.value.id,
    classificationSlug: result.value.classification,
    schemaType: slug,
    data: result.value.data,
    values: result.value.values,
    existsOnchain: false,
  }
}

export function buildPersonAtom(githubHandle: string, npmHandle?: string): DerivedAtom {
  const sameAs: string[] = [canonicalGitHubProfileUrl(githubHandle)]
  if (npmHandle) {
    sameAs.push(canonicalNpmProfileUrl(npmHandle))
  }
  return mustBuildAtom('person', {
    givenName: githubHandle,
    familyName: githubHandle,
    sameAs,
  })
}

export function buildSoftwareAtom(
  owner: string,
  name: string,
  _description: string,
  _language: string,
  npmPackageName?: string,
): DerivedAtom {
  const sameAs: string[] = [canonicalRepoUrl(owner, name)]
  if (npmPackageName) {
    sameAs.push(`https://www.npmjs.com/package/${npmPackageName}`)
  }
  return mustBuildAtom('software', {
    name,
    codeRepository: canonicalRepoUrl(owner, name),
    sameAs,
  })
}

export function buildSoftwareApplicationAtom(
  packageName: string,
  _version: string,
): DerivedAtom {
  const url = `https://www.npmjs.com/package/${packageName}`
  return mustBuildAtom('software-application', {
    name: packageName,
    url,
    sameAs: [url],
  })
}

export function buildIssueAtom(
  owner: string,
  repoName: string,
  issueNumber: number,
  title: string,
): DerivedAtom {
  const url = `https://github.com/${owner}/${repoName}/issues/${issueNumber}`
  return mustBuildAtom('article', {
    headline: title,
    url,
    sameAs: [url],
  })
}

export function buildPrAtom(
  owner: string,
  repoName: string,
  prNumber: number,
  title: string,
): DerivedAtom {
  const url = `https://github.com/${owner}/${repoName}/pull/${prNumber}`
  return mustBuildAtom('article', {
    headline: title,
    url,
    sameAs: [url],
  })
}

export function buildOrganizationAtom(name: string): DerivedAtom {
  const url = `https://github.com/${name}`
  return mustBuildAtom('company', {
    name,
    url,
    sameAs: [url],
  })
}

export function buildCustomPredicateAtom(
  name: string,
  description: string,
): { atom: DerivedAtom; id: Hex } {
  const result = buildCustomPredicate(name, description)
  if (!result.success) {
    throw new Error(`Failed to build custom predicate ${name}: ${result.errors.join(', ')}}`)
  }
  return {
    atom: {
      id: result.value.id,
      classificationSlug: result.value.classification,
      schemaType: 'defined-term',
      data: result.value.data,
      values: result.value.values,
      existsOnchain: false,
    },
    id: result.value.id,
  }
}

export function deriveTriple(
  subjectId: Hex,
  predicate: PredicateMapping,
  objectId: Hex,
): DerivedTriple {
  return {
    id: calculateTripleId(subjectId, predicate.id, objectId),
    subjectId,
    predicateId: predicate.id,
    predicateKey: predicate.key ?? predicate.name,
    objectId,
    existsOnchain: false,
  }
}
