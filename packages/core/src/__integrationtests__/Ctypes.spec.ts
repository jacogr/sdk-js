/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * @group integration/ctype
 */

import type { ICType, KeyringPair } from '@kiltprotocol/types'
import { BlockchainUtils, ExtrinsicErrors } from '@kiltprotocol/chain-helpers'
import {
  FullDidDetails,
  DemoKeystore,
  createOnChainDidFromSeed,
} from '@kiltprotocol/did'
import { randomAsHex } from '@polkadot/util-crypto'
import { Crypto } from '@kiltprotocol/utils'
import { CType } from '../ctype/CType'
import { getOwner } from '../ctype/CType.chain'
import { config, disconnect } from '../kilt'
import { devFaucet, keypairFromRandom, WS_ADDRESS } from './utils'

import '../../../../testingTools/jestErrorCodeMatcher'

beforeAll(async () => {
  config({ address: WS_ADDRESS })
})

describe('When there is an CtypeCreator and a verifier', () => {
  let ctypeCreator: FullDidDetails
  let paymentAccount: KeyringPair
  let ctypeCounter = 0
  const keystore = new DemoKeystore()

  function makeCType(): CType {
    ctypeCounter += 1
    return CType.fromSchema({
      $id: `kilt:ctype:0x${ctypeCounter}`,
      $schema: 'http://kilt-protocol.org/draft-01/ctype#',
      title: `ctype1${ctypeCounter}`,
      properties: {
        name: { type: 'string' },
      },
      type: 'object',
    } as ICType['schema'])
  }

  beforeAll(async () => {
    paymentAccount = devFaucet
    ctypeCreator = await createOnChainDidFromSeed(
      paymentAccount,
      keystore,
      randomAsHex(32)
    )
  })

  it('should not be possible to create a claim type w/o tokens', async () => {
    const ctype = makeCType()
    const bobbyBroke = keypairFromRandom()
    await expect(
      ctype
        .store()
        .then((tx) =>
          ctypeCreator.authorizeExtrinsic(
            tx,
            keystore,
            bobbyBroke.address,
            false
          )
        )
        .then((tx) =>
          BlockchainUtils.signAndSubmitTx(tx, bobbyBroke, {
            resolveOn: BlockchainUtils.IS_IN_BLOCK,
            reSign: true,
          })
        )
    ).rejects.toThrowError()
    await expect(ctype.verifyStored()).resolves.toBeFalsy()
  }, 20_000)

  it('should be possible to create a claim type', async () => {
    const ctype = makeCType()
    await ctype
      .store()
      .then((tx) =>
        ctypeCreator.authorizeExtrinsic(tx, keystore, paymentAccount.address)
      )
      .then((tx) =>
        BlockchainUtils.signAndSubmitTx(tx, paymentAccount, {
          resolveOn: BlockchainUtils.IS_IN_BLOCK,
          reSign: true,
        })
      )
    await Promise.all([
      expect(getOwner(ctype.hash)).resolves.toBe(ctypeCreator.did),
      expect(ctype.verifyStored()).resolves.toBeTruthy(),
    ])
    ctype.owner = ctypeCreator.did
    await expect(ctype.verifyStored()).resolves.toBeTruthy()
  }, 40_000)

  it('should not be possible to create a claim type that exists', async () => {
    const ctype = makeCType()
    await ctype
      .store()
      .then((tx) =>
        ctypeCreator.authorizeExtrinsic(tx, keystore, paymentAccount.address)
      )
      .then((tx) =>
        BlockchainUtils.signAndSubmitTx(tx, paymentAccount, {
          resolveOn: BlockchainUtils.IS_IN_BLOCK,
          reSign: true,
        })
      )
    await expect(
      ctype
        .store()
        .then((tx) =>
          ctypeCreator.authorizeExtrinsic(tx, keystore, paymentAccount.address)
        )
        .then((tx) =>
          BlockchainUtils.signAndSubmitTx(tx, paymentAccount, {
            resolveOn: BlockchainUtils.IS_IN_BLOCK,
            reSign: true,
          })
        )
    ).rejects.toThrowErrorWithCode(
      ExtrinsicErrors.CType.ERROR_CTYPE_ALREADY_EXISTS.code
    )
    // console.log('Triggered error on re-submit')
    await expect(getOwner(ctype.hash)).resolves.toBe(ctypeCreator.did)
  }, 45_000)

  it('should tell when a ctype is not on chain', async () => {
    const iAmNotThere = CType.fromSchema({
      $id: 'kilt:ctype:0x2',
      $schema: 'http://kilt-protocol.org/draft-01/ctype#',
      title: 'ctype2',
      properties: {
        game: { type: 'string' },
      },
      type: 'object',
    } as ICType['schema'])

    const iAmNotThereWithOwner = CType.fromSchema(
      {
        $id: 'kilt:ctype:0x3',
        $schema: 'http://kilt-protocol.org/draft-01/ctype#',
        title: 'ctype2',
        properties: {
          game: { type: 'string' },
        },
        type: 'object',
      },
      ctypeCreator.did
    )

    await Promise.all([
      expect(iAmNotThere.verifyStored()).resolves.toBeFalsy(),
      expect(getOwner(iAmNotThere.hash)).resolves.toBeNull(),
      expect(getOwner(Crypto.hashStr('abcdefg'))).resolves.toBeNull(),
      expect(iAmNotThereWithOwner.verifyStored()).resolves.toBeFalsy(),
    ])
  })
})

afterAll(() => {
  disconnect()
})
