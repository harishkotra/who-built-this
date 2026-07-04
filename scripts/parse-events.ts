import { createPublicClient, http, parseEventLogs } from 'viem'
import { intuitionTestnet } from '@0xintuition/deployments'
import { MultiVaultAbi } from '@0xintuition/protocol'

const client = createPublicClient({ chain: intuitionTestnet, transport: http('https://testnet.rpc.intuition.systems/http') })

async function main() {
  const tx1 = '0x162792250a34aceab00a407e82202bd6f20c88a61c1bc877d5b3b09a1821b2a7'
  const tx2 = '0x99e83a9d182cbaa42e8e3698f8910c4c3de0292a2b20933cbd34dae01b234812'

  const atoms: Record<string, any> = {}
  const triples: any[] = []

  for (const [label, hash] of [['tx1', tx1], ['tx2', tx2]] as const) {
    const receipt = await client.getTransactionReceipt({ hash })

    try {
      const evts = parseEventLogs({ abi: MultiVaultAbi, logs: receipt.logs, eventName: 'AtomCreated' })
      for (const e of evts) {
        const id = e.args.termId!
        atoms[id] = { term_id: id, creator: e.args.creator, event: label }
        console.log(`Atom: ${id}`)
      }
    } catch (e) {}

    try {
      const evts = parseEventLogs({ abi: MultiVaultAbi, logs: receipt.logs, eventName: 'TripleCreated' })
      for (const e of evts) {
        const entry = {
          term_id: e.args.termId,
          subject_id: e.args.subjectId,
          predicate_id: e.args.predicateId,
          object_id: e.args.objectId,
        }
        triples.push(entry)
        console.log(`Triple: ${entry.term_id} = ${entry.subject_id} -> ${entry.predicate_id} -> ${entry.object_id}`)
      }
    } catch (e) {}
  }

  console.log(`\n=== Summary ===`)
  console.log(`Atoms: ${Object.keys(atoms).length}`)
  console.log(`Triples: ${triples.length}`)
  console.log(JSON.stringify({ atoms: Object.keys(atoms), triples }, null, 2))
}

main().catch(console.error)
