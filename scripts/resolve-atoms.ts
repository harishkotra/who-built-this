import { createPublicClient, http, parseEventLogs } from 'viem'
import { intuitionTestnet } from '@0xintuition/deployments'
import { MultiVaultAbi } from '@0xintuition/protocol'

const RPC = 'https://testnet.rpc.intuition.systems/http'
const client = createPublicClient({ chain: intuitionTestnet, transport: http(RPC) })
const multiVaultAddr = '0xeBc49d356B7f64D888130D85CC6D17114a6843ec'

const KNOWN_LABELS: Record<string, string> = {
  '0xa4ecbecb9f9cc868ab349f370ab85f86c0a2f4c68cad90e031599bf03937cb20': 'contributedTo',
  '0xcb7feefa0414c4379888d38daedf01635f4e1ea56417d0edb501278fcc2134d0': 'authored',
  '0x127880cc7cf6361e97ed9d629eced6ab06d2b05b5c18dba93953c53ac1eb007e': 'mergedBy',
  '0xdd0dd7eed5efa7ee0addd61ba992299d7ff3f983b9311bb0cd87953e2e5fa7ab': 'hasPackage',
  '0x840dece2a0bc379d7c6e2955e41bfa60d8dacd050aa2855b93ab497f6393f5eb': 'maintainedBy',
  '0xdc5a9ea0e1921ebbe8044f76429dc01a772223a07b3733dea08565b2852affde': 'worksAt',
}

async function main() {
  const tx2 = '0x99e83a9d182cbaa42e8e3698f8910c4c3de0292a2b20933cbd34dae01b234812'
  const receipt = await client.getTransactionReceipt({ hash: tx2 })
  const tripleEvents = parseEventLogs({ abi: MultiVaultAbi, logs: receipt.logs, eventName: 'TripleCreated' })

  const triples: any[] = []
  const allAtomIds = new Set<string>()

  for (const id of Object.keys(KNOWN_LABELS)) allAtomIds.add(id)

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

  console.log(`Total unique atom IDs: ${allAtomIds.size}`)
  console.log(`Triples: ${triples.length}`)

  const atoms: Record<string, any> = {}
  for (const id of Object.keys(KNOWN_LABELS)) {
    atoms[id] = { term_id: id, label: KNOWN_LABELS[id], type: 'defined-term', emoji: '' }
  }

  // Try to resolve unknown atoms via eth_call getAtom
  // First check what view functions the ABI has
  const viewFns = MultiVaultAbi.filter((f: any) => f.type === 'function' && f.stateMutability === 'view')
  // Look for getAtom or similar
  for (const f of viewFns) {
    const fn = f as any
    if (fn.name.toLowerCase().includes('atom') && fn.inputs?.length === 1) {
      console.log(`View function: ${fn.name}(${fn.inputs[0].type}) -> ${fn.outputs?.map((o:any)=>o.type).join(',')}`)
    }
  }

  // Try calling getAtom on one unknown ID
  const unknownIds = [...allAtomIds].filter(id => !KNOWN_LABELS[id])
  for (const id of unknownIds.slice(0, 3)) {
    for (const fn of viewFns) {
      const f = fn as any
      if (f.name.toLowerCase().includes('atom') && f.inputs?.length === 1) {
        try {
          const result = await client.readContract({
            address: multiVaultAddr as `0x${string}`,
            abi: [f],
            functionName: f.name,
            args: [id],
          })
          console.log(`\n${f.name}("${id.slice(0,10)}..."): ${JSON.stringify(result).slice(0, 200)}`)
          break
        } catch (e) {
          // might not match
        }
      }
    }
  }

  const unknown = unknownIds.filter(id => !atoms[id])
  for (const id of unknown) {
    atoms[id] = { term_id: id, label: id.slice(0, 10) + '...', type: 'unknown', emoji: '', _unknown: true }
  }

  const dataset = {
    atoms: Object.values(atoms),
    triples,
    _meta: {
      tx_block: Number(receipt.blockNumber),
      tx2_hash: tx2,
      creator: '0xA2c0CDd6882543884A89Ed97F8f2fa231661eE8E',
    }
  }

  const fs = await import('fs')
  fs.writeFileSync('data/onchain-dataset.json', JSON.stringify(dataset, null, 2))
  console.log(`\nWritten to data/onchain-dataset.json`)
  console.log(`Atoms: ${dataset.atoms.length}, Triples: ${dataset.triples.length}`)
}

main().catch(console.error)
