import type { Hex } from 'viem'
import type {
  RepoInfo, DerivedAtom, DerivedTriple, AtomEntry,
  PRInfo, IssueInfo,
} from '../types'
import { DEFAULT_PR_LIMIT, DEFAULT_ISSUE_LIMIT } from '../config'
import { fetchRepo, fetchContributors, fetchMergedPRs, fetchClosedIssues, fetchUserRepos } from './github'
import { fetchNpmMetadata, guessNpmPackageName } from './npm'
import {
  buildPersonAtom,
  buildSoftwareAtom,
  buildSoftwareApplicationAtom,
  buildIssueAtom,
  buildPrAtom,
  buildOrganizationAtom,
  deriveTriple,
} from '../atoms/builder'
import { getCustomPredicate } from '../predicates/vocabulary'
import {
  lookupByGithubHandle, lookupByRepoUrl, lookupByNpmPackage,
  storeAtom, storeTriple, persistRegistry,
} from '../graph/registry'
import { publishAll } from '../graph/onchain'

interface PipelineContext {
  repo: RepoInfo
  issues: IssueInfo[]
  prs: PRInfo[]
  npmPackageName?: string
  allAtoms: Map<string, DerivedAtom>
  allTriples: DerivedTriple[]
  repoAtom: DerivedAtom | null
  pkgAtom: DerivedAtom | null
  personAtoms: Map<string, DerivedAtom>
  orgAtoms: Map<string, DerivedAtom>
  issueAtoms: Map<string, DerivedAtom>
  prAtoms: Map<string, DerivedAtom>
}

export async function ingestRepo(owner: string, repoName: string, publish = false, offline = false): Promise<void> {
  console.log(`\n=== Ingesting ${owner}/${repoName} ===`)
  console.log('Stage 1: Fetch & Normalize')
  const repo = await fetchRepo(owner, repoName)
  console.log(`  Repo: ${repo.fullName} (${repo.language}, ★${repo.stars})`)

  const npmPackageName = guessNpmPackageName(owner, repoName)
  const npmMeta = await fetchNpmMetadata(npmPackageName)
  if (npmMeta) {
    console.log(`  npm package: ${npmMeta.name}@${npmMeta.version}`)
  } else {
    console.log(`  No npm package found for "${npmPackageName}"`)
  }

  console.log('  Fetching contributors...')
  const contributors = await fetchContributors(owner, repoName)
  console.log(`  Found ${contributors.length} contributors`)

  console.log('  Fetching merged PRs...')
  const prs = await fetchMergedPRs(owner, repoName, DEFAULT_PR_LIMIT)
  console.log(`  Found ${prs.length} merged PRs`)

  console.log('  Fetching closed issues...')
  const issues = await fetchClosedIssues(owner, repoName, DEFAULT_ISSUE_LIMIT)
  console.log(`  Found ${issues.length} closed issues`)

  const ctx: PipelineContext = {
    repo,
    issues,
    prs,
    npmPackageName: npmMeta?.name,
    allAtoms: new Map(),
    allTriples: [],
    repoAtom: null,
    pkgAtom: null,
    personAtoms: new Map(),
    orgAtoms: new Map(),
    issueAtoms: new Map(),
    prAtoms: new Map(),
  }

  console.log('\nStage 2: Canonicalize & Build Atoms')

  const existingRepo = lookupByRepoUrl(repo.url)
  if (existingRepo) {
    console.log(`  Repo atom already exists (${existingRepo.id})`)
    ctx.repoAtom = existingAtomFromEntry(existingRepo)
    ctx.allAtoms.set(existingRepo.id, ctx.repoAtom)
  } else {
    ctx.repoAtom = buildSoftwareAtom(repo.owner, repo.name, repo.description, repo.language, npmPackageName)
    console.log(`  Repo atom: ${ctx.repoAtom.id}`)
    ctx.allAtoms.set(ctx.repoAtom.id, ctx.repoAtom)
  }

  if (npmMeta) {
    const existingPkg = lookupByNpmPackage(npmMeta.name)
    if (existingPkg) {
      console.log(`  Package atom already exists (${existingPkg.id})`)
      ctx.pkgAtom = existingAtomFromEntry(existingPkg)
      ctx.allAtoms.set(existingPkg.id, ctx.pkgAtom)
    } else {
      ctx.pkgAtom = buildSoftwareApplicationAtom(npmMeta.name, npmMeta.version)
      console.log(`  Package atom: ${ctx.pkgAtom.id}`)
      ctx.allAtoms.set(ctx.pkgAtom.id, ctx.pkgAtom)
    }
  }

  for (const c of contributors) {
    const existing = lookupByGithubHandle(c.login)
    if (existing) {
      const atom = existingAtomFromEntry(existing)
      ctx.personAtoms.set(c.login.toLowerCase(), atom)
      ctx.allAtoms.set(atom.id, atom)
    } else {
      const atom = buildPersonAtom(c.login)
      ctx.personAtoms.set(c.login.toLowerCase(), atom)
      ctx.allAtoms.set(atom.id, atom)
    }
  }
  console.log(`  Person atoms: ${ctx.personAtoms.size}`)

  const orgAtom = buildOrganizationAtom(repo.owner)
  ctx.orgAtoms.set(repo.owner.toLowerCase(), orgAtom)
  ctx.allAtoms.set(orgAtom.id, orgAtom)

  for (const issue of issues) {
    const key = `issue-${issue.number}`
    const atom = buildIssueAtom(owner, repoName, issue.number, issue.title)
    ctx.issueAtoms.set(key, atom)
    ctx.allAtoms.set(atom.id, atom)
  }
  console.log(`  Issue atoms: ${ctx.issueAtoms.size}`)

  for (const pr of prs) {
    const key = `pr-${pr.number}`
    const atom = buildPrAtom(owner, repoName, pr.number, pr.title)
    ctx.prAtoms.set(key, atom)
    ctx.allAtoms.set(atom.id, atom)
  }
  console.log(`  PR atoms: ${ctx.prAtoms.size}`)

  console.log('\nStage 3: Derive Atom IDs')
  console.log(`  Total derived atom IDs: ${ctx.allAtoms.size}`)

  if (offline) {
    console.log('\n(Offline mode - storing derived atoms locally only)')
    saveAtomsToRegistry(ctx)
    persistRegistry()
    console.log('Done. Use --publish to write onchain.')
    return
  }

  console.log('\nStage 4: Deduplicate Against Graph')
  const atomsToPublish: DerivedAtom[] = []
  const existingAtomsCount = 0
  for (const atom of ctx.allAtoms.values()) {
    if (!atom.existsOnchain) {
      atomsToPublish.push(atom)
    }
  }
  console.log(`  New atoms: ${atomsToPublish.length}, Already onchain: ${existingAtomsCount}`)

  console.log('\nStage 5: Build Triple Graph')
  const triples = buildTriplesForRepo(ctx)
  ctx.allTriples.push(...triples)

  const triplesToPublish = triples.filter(t => !t.existsOnchain)
  const existingTriplesCount = triples.length - triplesToPublish.length
  console.log(`  New triples: ${triplesToPublish.length}, Already onchain: ${existingTriplesCount}`)

  if (publish) {
    console.log('\nStage 6: Batch Onchain Publication')
    if (atomsToPublish.length > 0 || triplesToPublish.length > 0) {
      await publishAll(atomsToPublish, triplesToPublish)
    } else {
      console.log('  Everything already onchain')
    }
  } else {
    console.log('\n(Skip publish - use --publish to write onchain)')
  }

  saveAtomsToRegistry(ctx)
  for (const triple of ctx.allTriples) {
    storeTriple({
      id: triple.id,
      subjectId: triple.subjectId,
      predicateId: triple.predicateId,
      predicateKey: triple.predicateKey,
      objectId: triple.objectId,
      existsOnchain: triple.existsOnchain,
    })
  }
  persistRegistry()

  console.log('\n=== Ingest complete ===')
  printSummary(ctx.allAtoms, ctx.allTriples)
}

function buildTriplesForRepo(ctx: PipelineContext): DerivedTriple[] {
  const triples: DerivedTriple[] = []
  const contributedToPred = getCustomPredicate('contributedTo', 'Indicates that a person contributed to a software repository')
  const authoredPred = getCustomPredicate('authored', 'Indicates that a person authored a specific issue or pull request')
  const mergedByPred = getCustomPredicate('mergedBy', 'Indicates that a person merged a pull request')
  const hasPackagePred = getCustomPredicate('hasPackage', 'Indicates that a repository has a corresponding npm package')
  const maintainedByPred = getCustomPredicate('maintainedBy', 'Indicates that a repository is maintained by a person')
  const worksAtPred = getCustomPredicate('worksAt', 'Indicates that a person works at an organization')

  const repoAtom = ctx.repoAtom!

  for (const person of ctx.personAtoms.values()) {
    triples.push(deriveTriple(person.id, contributedToPred, repoAtom.id))
  }

  const topContributors = Array.from(ctx.personAtoms.entries()).slice(0, 5)
  for (const [, person] of topContributors) {
    triples.push(deriveTriple(repoAtom.id, maintainedByPred, person.id))
  }

  if (ctx.pkgAtom) {
    triples.push(deriveTriple(repoAtom.id, hasPackagePred, ctx.pkgAtom.id))
  }

  for (const [, org] of ctx.orgAtoms) {
    triples.push(deriveTriple(org.id, worksAtPred, repoAtom.id))
  }

  for (const [key, issueAtom] of ctx.issueAtoms) {
    const issue = ctx.issues.find(i => `issue-${i.number}` === key)
    if (issue) {
      const authorAtom = ctx.personAtoms.get(issue.author.login.toLowerCase())
      if (authorAtom) {
        triples.push(deriveTriple(authorAtom.id, authoredPred, issueAtom.id))
      }
    }
  }

  for (const [key, prAtom] of ctx.prAtoms) {
    const pr = ctx.prs.find(p => `pr-${p.number}` === key)
    if (pr) {
      const authorAtom = ctx.personAtoms.get(pr.author.login.toLowerCase())
      if (authorAtom) {
        triples.push(deriveTriple(authorAtom.id, authoredPred, prAtom.id))
      }
      if (pr.mergedBy) {
        const mergerAtom = ctx.personAtoms.get(pr.mergedBy.login.toLowerCase())
        if (mergerAtom) {
          triples.push(deriveTriple(mergerAtom.id, mergedByPred, prAtom.id))
        }
      }
    }
  }

  return triples
}

function saveAtomsToRegistry(ctx: PipelineContext): void {
  for (const atom of ctx.allAtoms.values()) {
    storeAtom(
      {
        id: atom.id,
        classificationSlug: atom.classificationSlug,
        schemaType: atom.schemaType,
        data: atom.data,
        values: atom.values,
        existsOnchain: atom.existsOnchain,
      },
    )
  }

  for (const [handle, atom] of ctx.personAtoms) {
    storeAtom(
      {
        id: atom.id,
        classificationSlug: atom.classificationSlug,
        schemaType: atom.schemaType,
        data: atom.data,
        values: atom.values,
        existsOnchain: atom.existsOnchain,
      },
      handle,
    )
  }

  const repoAtom = ctx.repoAtom!
  storeAtom(
    {
      id: repoAtom.id,
      classificationSlug: repoAtom.classificationSlug,
      schemaType: repoAtom.schemaType,
      data: repoAtom.data,
      values: repoAtom.values,
      existsOnchain: repoAtom.existsOnchain,
    },
    undefined,
    ctx.repo.url,
    ctx.npmPackageName,
  )

  if (ctx.pkgAtom) {
    storeAtom(
      {
        id: ctx.pkgAtom.id,
        classificationSlug: ctx.pkgAtom.classificationSlug,
        schemaType: ctx.pkgAtom.schemaType,
        data: ctx.pkgAtom.data,
        values: ctx.pkgAtom.values,
        existsOnchain: ctx.pkgAtom.existsOnchain,
      },
      undefined,
      undefined,
      ctx.npmPackageName,
    )
  }
}

function printSummary(atoms: Map<string, DerivedAtom>, triples: DerivedTriple[]): void {
  const typeCounts = new Map<string, number>()
  for (const atom of atoms.values()) {
    typeCounts.set(atom.classificationSlug, (typeCounts.get(atom.classificationSlug) ?? 0) + 1)
  }
  console.log('\nAtoms by type:')
  for (const [type, count] of typeCounts) {
    console.log(`  ${type}: ${count}`)
  }
  console.log(`Triples: ${triples.length}`)
}

function existingAtomFromEntry(entry: AtomEntry): DerivedAtom {
  return {
    id: entry.id as Hex,
    classificationSlug: entry.classificationSlug,
    schemaType: entry.schemaType,
    data: entry.data,
    values: entry.values,
    existsOnchain: entry.existsOnchain,
  }
}

export async function fetchProfileData(githubHandle: string): Promise<{
  profileAtom: DerivedAtom | null
  repos: RepoInfo[]
}> {
  const existing = lookupByGithubHandle(githubHandle)
  let profileAtom: DerivedAtom | null = null
  if (existing) {
    profileAtom = existingAtomFromEntry(existing)
  } else {
    profileAtom = buildPersonAtom(githubHandle)
  }

  const repos = await fetchUserRepos(githubHandle)
  return { profileAtom, repos }
}
