import { SubmittableExtrinsic } from '@polkadot/api/SubmittableExtrinsic'
import { CodecResult } from '@polkadot/api/promise/types'
import { Option, Text } from '@polkadot/types'

import { getCached } from '../blockchainApiConnection'
import { IDid } from '../did/Did'
import {
  getAddressFromIdentifier,
  getIdentifierFromAddress,
  decodeDid,
} from '../did/Did.utils'
import Identity from '../identity/Identity'
import { TxStatus } from '../blockchain/TxStatus'
import IPublicIdentity from '../types/PublicIdentity'

export async function queryByIdentifier(
  identifier: IDid['identifier']
): Promise<IDid | undefined> {
  const blockchain = await getCached()
  const address = getAddressFromIdentifier(identifier)
  const decoded: IDid | undefined = decodeDid(
    identifier,
    await blockchain.api.query.dID.dIDs(address)
  )
  return decoded
}

export async function queryByAddress(
  address: IPublicIdentity['address']
): Promise<IDid | undefined> {
  const blockchain = await getCached()
  const identifier = getIdentifierFromAddress(address)
  const decoded: IDid | undefined = decodeDid(
    identifier,
    await blockchain.api.query.dID.dIDs(address)
  )
  return decoded
}

export async function remove(identity: Identity): Promise<TxStatus> {
  const blockchain = await getCached()
  const tx: SubmittableExtrinsic<
    CodecResult,
    any
  > = await blockchain.api.tx.did.remove()
  return blockchain.submitTx(identity, tx)
}

export async function store(did: IDid, identity: Identity): Promise<TxStatus> {
  const blockchain = await getCached()
  const tx: SubmittableExtrinsic<
    CodecResult,
    any
  > = await blockchain.api.tx.did.add(
    did.publicBoxKey,
    did.publicSigningKey,
    new Option(Text, did.documentStore)
  )
  return blockchain.submitTx(identity, tx)
}
