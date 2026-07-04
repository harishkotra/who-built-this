import { GITHUB_API_BASE, GITHUB_TOKEN } from '../config'
import type { RepoInfo, ContributorInfo, PRInfo, IssueInfo, ContributorBrief } from '../types'

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'who-built-this/1.0',
  }
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  }
  return headers
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders() })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`GitHub API error ${response.status} for ${url}: ${body.slice(0, 200)}`)
  }
  return response.json() as Promise<T>
}

export interface GitHubRepo {
  name: string
  full_name: string
  description: string
  html_url: string
  language: string
  stargazers_count: number
  owner: { login: string }
}

export interface GitHubContributor {
  login: string
  id: number
  avatar_url: string
  html_url: string
  contributions: number
}

export interface GitHubPR {
  number: number
  title: string
  html_url: string
  state: string
  user: { login: string } | null
  merged_by: { login: string } | null
  created_at: string
  merged_at: string | null
}

export interface GitHubIssue {
  number: number
  title: string
  html_url: string
  state: string
  user: { login: string } | null
  created_at: string
  closed_at: string | null
}

export async function fetchRepo(owner: string, name: string): Promise<RepoInfo> {
  const data = await fetchJson<GitHubRepo>(`${GITHUB_API_BASE}/repos/${owner}/${name}`)
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    description: data.description ?? '',
    url: data.html_url,
    language: data.language ?? 'Unknown',
    stars: data.stargazers_count,
  }
}

export async function fetchContributors(owner: string, name: string): Promise<ContributorInfo[]> {
  const items: ContributorInfo[] = []
  const perPage = 100
  let page = 1
  for (;;) {
    const data = await fetchJson<GitHubContributor[]>(
      `${GITHUB_API_BASE}/repos/${owner}/${name}/contributors?per_page=${perPage}&page=${page}&anon=false`,
    )
    if (data.length === 0) break
    for (const c of data) {
      items.push({
        login: c.login,
        id: c.id,
        avatarUrl: c.avatar_url,
        url: c.html_url,
        contributions: c.contributions,
      })
    }
    if (data.length < perPage) break
    page++
  }
  return items
}

export async function fetchMergedPRs(owner: string, name: string, limit = 100): Promise<PRInfo[]> {
  const data = await fetchJson<GitHubPR[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${name}/pulls?state=closed&per_page=${Math.min(limit, 100)}&sort=updated&direction=desc`,
  )
  return data
    .filter(pr => pr.merged_by !== null)
    .slice(0, limit)
    .map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.state,
      author: { login: pr.user?.login ?? 'unknown' } as ContributorBrief,
      mergedBy: pr.merged_by ? { login: pr.merged_by.login } as ContributorBrief : undefined,
      createdAt: pr.created_at,
      mergedAt: pr.merged_at ?? undefined,
    }))
}

export async function fetchClosedIssues(owner: string, name: string, limit = 100): Promise<IssueInfo[]> {
  const data = await fetchJson<GitHubIssue[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${name}/issues?state=closed&per_page=${Math.min(limit, 100)}&sort=updated&direction=desc&filter=all`,
  )
  return data
    .filter(issue => !issue.html_url.includes('/pull/'))
    .slice(0, limit)
    .map(issue => ({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      author: { login: issue.user?.login ?? 'unknown' } as ContributorBrief,
      createdAt: issue.created_at,
      closedAt: issue.closed_at ?? undefined,
    }))
}

export async function fetchUserRepos(username: string): Promise<RepoInfo[]> {
  const data = await fetchJson<GitHubRepo[]>(
    `${GITHUB_API_BASE}/users/${username}/repos?per_page=100&sort=updated&type=owner`,
  )
  return data.map(r => ({
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? '',
    url: r.html_url,
    language: r.language ?? 'Unknown',
    stars: r.stargazers_count,
  }))
}
