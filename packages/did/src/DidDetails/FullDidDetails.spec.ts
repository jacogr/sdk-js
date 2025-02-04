/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/**
 * @group unit/did
 */

import { KeyRelationship } from '@kiltprotocol/types'
import { BN } from '@polkadot/util'
import type { IDidKeyDetails, IDidServiceEndpoint } from '@kiltprotocol/types'
import { mapCallToKeyRelationship } from './FullDidDetails.utils'
import { FullDidDetails } from './FullDidDetails'
import type { FullDidDetailsCreationOpts } from '../types'
import { assembleDidFragment } from '../Did.utils'

describe('functional tests', () => {
  const identifier = '4rp4rcDHP71YrBNvDhcH5iRoM3YzVoQVnCZvQPwPom9bjo2e'
  const did = `did:kilt:${identifier}`
  const keys: IDidKeyDetails[] = [
    {
      id: assembleDidFragment(did, '1'),
      controller: did,
      includedAt: 100,
      type: 'ed25519',
      publicKeyHex:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    {
      id: assembleDidFragment(did, '2'),
      controller: did,
      includedAt: 250,
      type: 'x25519',
      publicKeyHex:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    {
      id: assembleDidFragment(did, '3'),
      controller: did,
      includedAt: 250,
      type: 'x25519',
      publicKeyHex:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
    {
      id: assembleDidFragment(did, '4'),
      controller: did,
      includedAt: 200,
      type: 'sr25519',
      publicKeyHex:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    },
  ]
  const serviceEndpoints: IDidServiceEndpoint[] = [
    {
      id: assembleDidFragment(did, 'service-1'),
      types: ['type-1'],
      urls: ['url-1'],
    },
    {
      id: assembleDidFragment(did, 'service-2'),
      types: ['type-2'],
      urls: ['url-2'],
    },
  ]
  const didDetails: FullDidDetailsCreationOpts = {
    did,
    keys,
    keyRelationships: {
      [KeyRelationship.authentication]: [keys[0].id],
      [KeyRelationship.keyAgreement]: [keys[1].id, keys[2].id],
      [KeyRelationship.assertionMethod]: [keys[3].id],
    },
    serviceEndpoints,
    lastTxIndex: new BN(10),
  }

  it('creates FullDidDetails', () => {
    const dd = new FullDidDetails(didDetails)
    expect(dd.did).toStrictEqual(did)
    expect(dd.identifier).toStrictEqual(identifier)
    expect(dd.getKeys()).toMatchInlineSnapshot(`
      Array [
        Object {
          "controller": "${did}",
          "id": "${did}#1",
          "includedAt": 100,
          "publicKeyHex": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "type": "ed25519",
        },
        Object {
          "controller": "${did}",
          "id": "${did}#2",
          "includedAt": 250,
          "publicKeyHex": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "type": "x25519",
        },
        Object {
          "controller": "${did}",
          "id": "${did}#3",
          "includedAt": 250,
          "publicKeyHex": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "type": "x25519",
        },
        Object {
          "controller": "${did}",
          "id": "${did}#4",
          "includedAt": 200,
          "publicKeyHex": "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          "type": "sr25519",
        },
      ]
    `)
    expect(dd.getEndpoints()).toMatchInlineSnapshot(`
      Array [
        Object {
          "id": "${did}#service-1",
          "types": Array [
            "type-1",
          ],
          "urls": Array [
            "url-1",
          ],
        },
        Object {
          "id": "${did}#service-2",
          "types": Array [
            "type-2",
          ],
          "urls": Array [
            "url-2",
          ],
        },
      ]
    `)
  })

  it('gets keys via role', () => {
    let dd = new FullDidDetails(didDetails)
    expect(dd.getKeyIds(KeyRelationship.authentication)).toStrictEqual([
      keys[0].id,
    ])
    expect(dd.getKeys(KeyRelationship.authentication)).toStrictEqual([keys[0]])
    expect(dd.getKeyIds(KeyRelationship.keyAgreement)).toStrictEqual(
      didDetails.keyRelationships![KeyRelationship.keyAgreement]
    )
    expect(
      dd.getKeys(KeyRelationship.keyAgreement).map((key) => key.id)
    ).toStrictEqual(didDetails.keyRelationships![KeyRelationship.keyAgreement])
    expect(dd.getKeyIds(KeyRelationship.assertionMethod)).toStrictEqual([
      keys[3].id,
    ])

    dd = new FullDidDetails({
      ...didDetails,
      keyRelationships: { [KeyRelationship.authentication]: [keys[3].id] },
    })
    expect(
      dd.getKeys(KeyRelationship.authentication).map((key) => key.id)
    ).toStrictEqual([keys[3].id])
    expect(dd.getKeyIds('none')).toStrictEqual(
      keys.slice(0, 3).map((key) => key.id)
    )
  })

  it('get the rights service endpoints', () => {
    const dd = new FullDidDetails(didDetails)
    expect(dd.getEndpoints()).toStrictEqual(serviceEndpoints)
    expect(dd.getEndpointById(`${dd.did}#service-1`)).toStrictEqual(
      serviceEndpoints[0]
    )
    expect(dd.getEndpointById(`${dd.did}#service-2`)).toStrictEqual(
      serviceEndpoints[1]
    )
    expect(dd.getEndpointById(`${dd.did}#service-3`)).toBeUndefined()
    expect(dd.getEndpointsByType('type-1')).toStrictEqual([serviceEndpoints[0]])
    expect(dd.getEndpointsByType('type-2')).toStrictEqual([serviceEndpoints[1]])
    expect(dd.getEndpointsByType('type-3')).toHaveLength(0)
  })

  it('returns the next nonce', () => {
    let dd = new FullDidDetails(didDetails)
    expect(dd.getNextTxIndex().toString()).toStrictEqual(
      didDetails.lastTxIndex.addn(1).toString()
    )
    expect(dd.getNextTxIndex().toString()).toStrictEqual(
      didDetails.lastTxIndex.addn(2).toString()
    )
    dd = new FullDidDetails(didDetails)
    expect(dd.getNextTxIndex(false).toString()).toStrictEqual(
      didDetails.lastTxIndex.addn(1).toString()
    )
    expect(dd.getNextTxIndex(false).toString()).toStrictEqual(
      didDetails.lastTxIndex.addn(1).toString()
    )
  })

  it('gets the correct keys for each pallet', () => {
    const dd = new FullDidDetails({
      ...didDetails,
      keyRelationships: {
        [KeyRelationship.authentication]: [keys[0].id],
        [KeyRelationship.capabilityDelegation]: [keys[1].id],
        [KeyRelationship.assertionMethod]: [keys[3].id],
      },
    })
    expect(
      dd
        .getKeysForCall({ section: 'ctype', method: 'add' })
        .map((key) => key.id)
    ).toMatchInlineSnapshot(`
      Array [
        "${did}#4",
      ]
    `)
    expect(
      dd
        .getKeysForCall({ section: 'delegation', method: 'revokeDelegation' })
        .map((key) => key.id)
    ).toMatchInlineSnapshot(`
      Array [
        "${did}#2",
      ]
    `)
    expect(
      dd
        .getKeysForCall({ section: 'attestation', method: 'add' })
        .map((key) => key.id)
    ).toMatchInlineSnapshot(`
      Array [
        "${did}#4",
      ]
    `)
  })
})

describe('Key mapping tests', () => {
  it('gets the right key relationship for each pallet', () => {
    // CTYPE
    expect(
      mapCallToKeyRelationship({ section: 'ctype', method: 'add' })
    ).toMatchInlineSnapshot(`"assertionMethod"`)
    // DELEGATION
    expect(
      mapCallToKeyRelationship({
        section: 'delegation',
        method: 'addDelegation',
      })
    ).toMatchInlineSnapshot(`"capabilityDelegation"`)
    expect(
      mapCallToKeyRelationship({
        section: 'delegation',
        method: 'revokeDelegation',
      })
    ).toMatchInlineSnapshot(`"capabilityDelegation"`)
    // ATTESTATION
    expect(
      mapCallToKeyRelationship({ section: 'attestation', method: 'add' })
    ).toMatchInlineSnapshot(`"assertionMethod"`)
    expect(
      mapCallToKeyRelationship({ section: 'attestation', method: 'revoke' })
    ).toMatchInlineSnapshot(`"assertionMethod"`)

    // DID
    expect(
      mapCallToKeyRelationship({
        section: 'did',
        method: 'create',
      })
    ).toMatchInlineSnapshot(`"paymentAccount"`)
    expect(
      mapCallToKeyRelationship({
        section: 'did',
        method: 'update',
      })
    ).toMatchInlineSnapshot(`"authentication"`)
    expect(
      mapCallToKeyRelationship({ section: 'did', method: 'submitDidCall' })
    ).toMatchInlineSnapshot(`"paymentAccount"`)
    // BALANCES
    expect(
      mapCallToKeyRelationship({ section: 'balances', method: 'transfer' })
    ).toMatchInlineSnapshot(`"paymentAccount"`)
  })
})
