import type { Hex } from 'viem'
import { createPublicClient, http } from 'viem'
import { intuitionTestnet } from '@0xintuition/deployments'
import { getMultiVaultAddressFromChainId } from '@0xintuition/deployments'
import { multiVaultIsTermCreated } from '@0xintuition/protocol'
import { INTUITION_CHAIN_ID, INTUITION_RPC_URL } from '../config'
import type { DerivedAtom, DerivedTriple } from '../types'

let _client: ReturnType<typeof createPublicClient> | null = null

function getClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: intuitionTestnet,
      transport: http(INTUITION_RPC_URL),
    })
  }
  return _client
}

export async function checkAtomExistsOnchain(atomId: Hex): Promise<boolean> {
  try {
    const multiVaultAddress = getMultiVaultAddressFromChainId(INTUITION_CHAIN_ID)
    const exists = await multiVaultIsTermCreated(
      { address: multiVaultAddress, publicClient: getClient() },
      { args: [atomId] },
    )
    return exists
  } catch {
    return false
  }
}

export async function checkTripleExistsOnchain(tripleId: Hex): Promise<boolean> {
  try {
    const multiVaultAddress = getMultiVaultAddressFromChainId(INTUITION_CHAIN_ID)
    const exists = await multiVaultIsTermCreated(
      { address: multiVaultAddress, publicClient: getClient() },
      { args: [tripleId] },
    )
    return exists
  } catch {
    return false
  }
}

export async function markExistingAtoms(atoms: DerivedAtom[]): Promise<void> {
  await Promise.all(atoms.map(async (atom) => {
    atom.existsOnchain = await checkAtomExistsOnchain(atom.id)
  }))
}

export async function markExistingTriples(triples: DerivedTriple[]): Promise<void> {
  await Promise.all(triples.map(async (triple) => {
    triple.existsOnchain = await checkTripleExistsOnchain(triple.id)
  }))
}

export async function filterNewAtoms(atoms: DerivedAtom[]): Promise<DerivedAtom[]> {
  const results = await Promise.all(
    atoms.map(async (atom) => ({
      atom,
      exists: await checkAtomExistsOnchain(atom.id),
    })),
  )
  return results
    .filter(r => {
      r.atom.existsOnchain = r.exists
      return !r.exists
    })
    .map(r => r.atom)
}

export async function filterNewTriples(triples: DerivedTriple[]): Promise<DerivedTriple[]> {
  const results = await Promise.all(
    triples.map(async (triple) => ({
      triple,
      exists: await checkTripleExistsOnchain(triple.id),
    })),
  )
  return results
    .filter(r => {
      r.triple.existsOnchain = r.exists
      return !r.exists
    })
    .map(r => r.triple)
}
