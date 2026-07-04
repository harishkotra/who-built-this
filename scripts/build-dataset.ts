import { createPublicClient, http, parseEventLogs } from 'viem'
import { intuitionTestnet } from '@0xintuition/deployments'
import { MultiVaultAbi } from '@0xintuition/protocol'
import * as fs from 'fs'

const RPC = 'https://testnet.rpc.intuition.systems/http'
const client = createPublicClient({ chain: intuitionTestnet, transport: http(RPC) })
const addr = '0xeBc49d356B7f64D888130D85CC6D17114a6843ec' as const

const KNOWN: Record<string, { label: string; type: string; emoji?: string }> = {
  '0xa4ecbecb9f9cc868ab349f370ab85f86c0a2f4c68cad90e031599bf03937cb20': { label: 'contributedTo', type: 'defined-term' },
  '0xcb7feefa0414c4379888d38daedf01635f4e1ea56417d0edb501278fcc2134d0': { label: 'authored', type: 'defined-term' },
  '0x127880cc7cf6361e97ed9d629eced6ab06d2b05b5c18dba93953c53ac1eb007e': { label: 'mergedBy', type: 'defined-term' },
  '0xdd0dd7eed5efa7ee0addd61ba992299d7ff3f983b9311bb0cd87953e2e5fa7ab': { label: 'hasPackage', type: 'defined-term' },
  '0x840dece2a0bc379d7c6e2955e41bfa60d8dacd050aa2855b93ab497f6393f5eb': { label: 'maintainedBy', type: 'defined-term' },
  '0xdc5a9ea0e1921ebbe8044f76429dc01a772223a07b3733dea08565b2852affde': { label: 'worksAt', type: 'defined-term' },
}

async function getAtomLabel(id: string): Promise<string | null> {
  try {
    const data = await client.readContract({
      address: addr,
      abi: MultiVaultAbi as any,
      functionName: 'getAtom',
      args: [id as `0x${string}`],
    })
    if (data) {
      const hex = data as `0x${string}`
      const raw = Buffer.from(hex.slice(2), 'hex').toString('utf8').replace(/\0/g, '')
      // Try to parse as JSON-LD
      try {
        const json = JSON.parse(raw)
        return json.name || json.givenName || json.headline || null
      } catch {
        // Return raw string if not valid JSON
        return raw.slice(0, 60).trim() || null
      }
    }
  } catch {}
  return null
}

async function main() {
  const tx2 = '0x99e83a9d182cbaa42e8e3698f8910c4c3de0292a2b20933cbd34dae01b234812'
  const receipt = await client.getTransactionReceipt({ hash: tx2 })

  const triples: any[] = []
  const allAtomIds = new Set<string>()

  for (const id of Object.keys(KNOWN)) allAtomIds.add(id)

  const tripleEvents = parseEventLogs({ abi: MultiVaultAbi, logs: receipt.logs, eventName: 'TripleCreated' })
  for (const e of tripleEvents) {
    triples.push({
      triple_id: e.args.termId,
      subject_id: e.args.subjectId,
      predicate_id: e.args.predicateId,
      object_id: e.args.objectId,
    })
    allAtomIds.add(e.args.subjectId!)
    allAtomIds.add(e.args.predicateId!)
    allAtomIds.add(e.args.objectId!)
  }

  console.log(`Total atom IDs to resolve: ${allAtomIds.size}`)

  const atoms: Record<string, any> = {}
  for (const [id, info] of Object.entries(KNOWN)) {
    atoms[id] = { term_id: id, label: info.label, type: info.type, emoji: info.emoji || '' }
  }

  // Resolve unknown atoms via readContract
  let resolved = 0
  for (const id of allAtomIds) {
    if (atoms[id]) continue
    process.stdout.write(`Resolving ${id.slice(0, 10)}... `)
    const label = await getAtomLabel(id)
    if (label) {
      atoms[id] = { term_id: id, label: label.slice(0, 60), type: 'atom', emoji: '' }
      console.log(`✓ ${label.slice(0, 40)}`)
      resolved++
    } else {
      atoms[id] = { term_id: id, label: id.slice(0, 10) + '...', type: 'unknown', emoji: '' }
      console.log('✗')
    }
  }

  console.log(`\nResolved ${resolved}/${allAtomIds.size - Object.keys(KNOWN).length} unknown atoms`)

  const dataset = {
    atoms: Object.values(atoms),
    triples: triples.map(t => ({
      subject_id: t.subject_id,
      predicate_id: t.predicate_id,
      object_id: t.object_id,
    })),
  }

  const output = `// Auto-generated from on-chain data (block ${receipt.blockNumber})
const FALLBACK_DATA = ${JSON.stringify(dataset, null, 2)}`

  fs.writeFileSync('data/fallback-data.js', output)
  console.log(`\nWritten: data/fallback-data.js`)
  console.log(`Atoms: ${dataset.atoms.length}, Triples: ${dataset.triples.length}`)
}

main().catch(console.error)
