import { NPM_API_BASE } from '../config'
import type { NpmPackageInfo } from '../types'

export interface NpmRegistryResponse {
  name: string
  'dist-tags'?: Record<string, string>
  description?: string
}

export async function fetchNpmMetadata(packageName: string): Promise<NpmPackageInfo | null> {
  try {
    const response = await fetch(`${NPM_API_BASE}/${encodeURIComponent(packageName).replace('%40', '@')}`)
    if (!response.ok) return null
    const data = (await response.json()) as NpmRegistryResponse
    return {
      name: data.name,
      version: data['dist-tags']?.latest ?? 'unknown',
      description: data.description ?? '',
      url: `https://www.npmjs.com/package/${data.name}`,
    }
  } catch {
    return null
  }
}

export function guessNpmPackageName(owner: string, repoName: string): string {
  if (owner.startsWith('@')) {
    return `${owner}/${repoName}`
  }
  if (repoName.startsWith('@')) {
    return repoName
  }
  return repoName
}
