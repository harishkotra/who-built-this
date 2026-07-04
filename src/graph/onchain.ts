import type { Hex } from 'viem'
import { http, createWalletClient, createPublicClient, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { intuitionTestnet } from '@0xintuition/deployments'
import { getMultiVaultAddressFromChainId } from '@0xintuition/deployments'
import { multiVaultCreateAtoms, multiVaultCreateTriples, multiVaultGetAtomCost, multiVaultGetTripleCost } from '@0xintuition/protocol'
import { INTUITION_CHAIN_ID, INTUITION_RPC_URL, PRIVATE_KEY } from '../config'
import type { DerivedAtom, DerivedTriple, AtomEntry } from '../types'
import { getRegistry, markAtomOnchain, markTripleOnchain, persistRegistry } from './registry'

if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable is required for onchain operations')
}

const account = privateKeyToAccount(PRIVATE_KEY)
const GAS_RESERVE = 10000000000000000n

function getWalletClient() {
  return createWalletClient({
    account,
    chain: intuitionTestnet,
    transport: http(INTUITION_RPC_URL),
  })
}

function getPublicClient() {
  return createPublicClient({
    chain: intuitionTestnet,
    transport: http(INTUITION_RPC_URL),
  })
}

function hexAtomData(atom: DerivedAtom): Hex {
  return `0x${Buffer.from(atom.data, 'utf-8').toString('hex')}` as Hex
}

function trimToBalance<T>(items: T[], balance: bigint, cost: bigint, label: string): T[] {
  const usable = balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n
  const totalNeeded = cost * BigInt(items.length)
  if (usable >= totalNeeded) return items
  const canFit = Number(usable / cost)
  if (canFit <= 0) {
    console.warn(`  Insufficient balance (${formatEther(balance)} tTRUST). Need ${formatEther(totalNeeded)} tTRUST for ${items.length} ${label}. Skipping.`)
    return []
  }
  console.warn(`  Balance only covers ${canFit}/${items.length} ${label}. Skipping ${items.length - canFit}.`)
  return items.slice(0, canFit)
}

export async function publishAtoms(atoms: DerivedAtom[]): Promise<void> {
  if (atoms.length === 0) {
    console.log('No new atoms to publish')
    return
  }

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const multiVaultAddress = getMultiVaultAddressFromChainId(INTUITION_CHAIN_ID)
  const config = { address: multiVaultAddress, walletClient, publicClient }

  const atomCost = await multiVaultGetAtomCost(config)
  console.log(`  Atom creation cost: ${formatEther(atomCost)} tTRUST each`)

  const balance = await publicClient.getBalance({ address: account.address })
  atoms = trimToBalance(atoms, balance, atomCost, 'atoms')
  if (atoms.length === 0) return

  const BATCH_SIZE = 50
  for (let i = 0; i < atoms.length; i += BATCH_SIZE) {
    const batch = atoms.slice(i, i + BATCH_SIZE)
    let pending = [...batch]
    let attempt = 0

    while (pending.length > 0) {
      const data: Hex[] = pending.map(a => hexAtomData(a))
      const assets: bigint[] = pending.map(() => atomCost)
      const totalValue = atomCost * BigInt(pending.length)

      console.log(`Publishing atoms ${i + 1}-${Math.min(i + batch.length, atoms.length)} of ${atoms.length}...`)
      try {
        const txHash = await multiVaultCreateAtoms(config, {
          args: [data, assets],
          value: totalValue,
        })
        console.log(`  Transaction: ${txHash}`)
        for (const atom of pending) {
          markAtomOnchain(atom.id)
        }
        persistRegistry()
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('MultiVault_AtomExists')) {
          const hexMatch = msg.match(/0x[0-9a-fA-F]+/)
          if (hexMatch) {
            const existingHex = hexMatch[0].toLowerCase()
            pending = pending.filter(a => {
              if (hexAtomData(a).toLowerCase() === existingHex) {
                console.warn(`  Atom ${a.id} data already onchain, skipping`)
                markAtomOnchain(a.id)
                return false
              }
              return true
            })
          } else {
            const skipped = pending.shift()!
            console.warn(`  Atom ${skipped.id} already onchain, skipping`)
            markAtomOnchain(skipped.id)
          }
          persistRegistry()
        } else {
          console.error(`  Failed to publish batch: ${msg}`)
          throw err
        }
      }
      attempt++
      if (attempt > 100) {
        console.error('  Too many retries, aborting atom publish')
        break
      }
    }
  }
}

export async function publishTriples(triples: DerivedTriple[]): Promise<void> {
  if (triples.length === 0) {
    console.log('No new triples to publish')
    return
  }

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const multiVaultAddress = getMultiVaultAddressFromChainId(INTUITION_CHAIN_ID)
  const config = { address: multiVaultAddress, walletClient, publicClient }

  const tripleCost = await multiVaultGetTripleCost(config)
  console.log(`  Triple creation cost: ${formatEther(tripleCost)} tTRUST each`)

  const balance = await publicClient.getBalance({ address: account.address })
  triples = trimToBalance(triples, balance, tripleCost, 'triples')
  if (triples.length === 0) return

  const BATCH_SIZE = 50
  for (let i = 0; i < triples.length; i += BATCH_SIZE) {
    const batch = triples.slice(i, i + BATCH_SIZE)
    let pending = [...batch]
    let attempt = 0

    while (pending.length > 0) {
      const subjectIds: Hex[] = pending.map(t => t.subjectId)
      const predicateIds: Hex[] = pending.map(t => t.predicateId)
      const objectIds: Hex[] = pending.map(t => t.objectId)
      const assets: bigint[] = pending.map(() => tripleCost)
      const totalValue = tripleCost * BigInt(pending.length)

      console.log(`Publishing triples ${i + 1}-${Math.min(i + batch.length, triples.length)} of ${triples.length}...`)
      try {
        const txHash = await multiVaultCreateTriples(config, {
          args: [subjectIds, predicateIds, objectIds, assets],
          value: totalValue,
        })
        console.log(`  Transaction: ${txHash}`)
        for (const triple of pending) {
          markTripleOnchain(triple.id)
        }
        persistRegistry()
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('MultiVault_TripleExists')) {
          const skipped = pending.shift()!
          console.warn(`  Triple ${skipped.id} already onchain, skipping`)
          markTripleOnchain(skipped.id)
          persistRegistry()
        } else if (msg.includes('MultiVault_TermDoesNotExist')) {
          const hexMatch = msg.match(/0x[0-9a-fA-F]{64}/)
          const missingTerm = hexMatch ? hexMatch[0].toLowerCase() : null
          pending = pending.filter(t => {
            const match = t.subjectId.toLowerCase() === missingTerm ||
              t.predicateId.toLowerCase() === missingTerm ||
              t.objectId.toLowerCase() === missingTerm
            if (match) {
              console.warn(`  Triple ${t.id} references nonexistent atom ${missingTerm}, skipping`)
            }
            return !match
          })
          persistRegistry()
        } else {
          console.error(`  Failed to publish triples: ${msg}`)
          throw err
        }
      }
      attempt++
      if (attempt > 100) {
        console.error('  Too many retries, aborting triple publish')
        break
      }
    }
  }
}

export async function publishAll(atoms: DerivedAtom[], triples: DerivedTriple[]): Promise<void> {
  const registry = getRegistry()
  const predicateAtoms: DerivedAtom[] = []
  for (const [predName, id] of Object.entries(registry.customPredicateToId)) {
    const entry = registry.atoms[id]
    if (entry && !entry.existsOnchain) {
      predicateAtoms.push(entryToDerived(entry))
    }
  }
  if (predicateAtoms.length > 0) {
    console.log(`\n=== Also publishing ${predicateAtoms.length} predicate atoms ===`)
    atoms = [...atoms]
    for (const pa of predicateAtoms) {
      if (!atoms.some(a => a.id === pa.id)) {
        atoms.push(pa)
      }
    }
  }

  if (atoms.length > 0) {
    console.log(`\n=== Publishing ${atoms.length} atoms onchain ===`)
    await publishAtoms(atoms)
  }
  if (triples.length > 0) {
    console.log(`\n=== Publishing ${triples.length} triples onchain ===`)
    await publishTriples(triples)
  }
}

function entryToDerived(entry: AtomEntry): DerivedAtom {
  return {
    id: entry.id as Hex,
    classificationSlug: entry.classificationSlug,
    schemaType: entry.schemaType,
    data: entry.data,
    values: entry.values,
    existsOnchain: entry.existsOnchain,
  }
}
