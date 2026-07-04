const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source', 'si', 'mc_cid', 'mc_eid',
])

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of parsed.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(key)
      }
    }
    parsed.search = parsed.searchParams.toString()
    return parsed.toString()
  } catch {
    return url
  }
}

export function canonicalGitHubProfileUrl(username: string): string {
  return `https://github.com/${username}`
}

export function canonicalNpmProfileUrl(username: string): string {
  return `https://www.npmjs.com/~${username}`
}

export function canonicalRepoUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}`
}

export function canonicalIssueUrl(owner: string, name: string, issueNumber: number): string {
  return `https://github.com/${owner}/${name}/issues/${issueNumber}`
}

export function canonicalPrUrl(owner: string, name: string, prNumber: number): string {
  return `https://github.com/${owner}/${name}/pull/${prNumber}`
}

export function canonicalNpmPackageUrl(packageName: string): string {
  return `https://www.npmjs.com/package/${packageName}`
}

export function normalizeUrl(url: string): string {
  return stripTrackingParams(url).replace(/\/+$/, '').toLowerCase()
}
