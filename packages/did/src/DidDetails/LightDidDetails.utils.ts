/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

import { encode as cborEncode, decode as cborDecode } from 'cbor'
import { SDKErrors } from '@kiltprotocol/utils'
import type { LightDidDetailsCreationOpts } from '../types'
import { getEncodingForSigningKeyType, parseDidUrl } from '../Did.utils'

const ENCRYPTION_KEY_MAP_KEY = 'e'
const SERVICES_KEY_MAP_KEY = 's'

export function checkLightDidCreationOptions(
  options: LightDidDetailsCreationOpts
): void {
  // Check authentication key type
  const authenticationKeyTypeEncoding = getEncodingForSigningKeyType(
    options.authenticationKey.type
  )
  if (!authenticationKeyTypeEncoding) {
    throw SDKErrors.ERROR_UNSUPPORTED_KEY
  }

  // Check service endpoints
  if (!options.serviceEndpoints) {
    return
  }

  // Checks that for all service IDs have regular strings as their ID and not a full DID.
  // Plus, we forbid a service ID to be `authentication` or `encryption` as that would create confusion
  // when upgrading to a full DID.
  options.serviceEndpoints?.forEach((service) => {
    let isServiceIdADid = true
    try {
      // parseDidUrl throws if the service ID is not a proper DID URI, which is exactly what we expect here.
      parseDidUrl(service.id)
    } catch {
      // Here if parseDidUrl throws -> service.id is NOT a DID.
      isServiceIdADid = false
    }

    if (isServiceIdADid) {
      throw new Error(
        `Invalid service ID provided: ${service.id}. The service ID should be a simple identifier and not a complete DID URI.`
      )
    }
    // A service ID cannot have a reserved ID that is used for key IDs.
    if (service.id === 'authentication' || service.id === 'encryption') {
      throw new Error(
        `Cannot specify a service ID with the name ${service.id} as it is a reserved keyword.`
      )
    }
  })
}

/**
 * Serialize the optional encryption key of an off-chain DID using the CBOR serialization algorithm and encoding the result in Base64 format.
 *
 * @param details The light DID details to encode.
 * @param details.encryptionKey The DID encryption key.
 * @param details.serviceEndpoints The DID service endpoints.
 * @returns The Base64-encoded and CBOR-serialized off-chain DID optional details.
 */
export function serializeAndEncodeAdditionalLightDidDetails({
  encryptionKey,
  serviceEndpoints,
}: Pick<LightDidDetailsCreationOpts, 'encryptionKey' | 'serviceEndpoints'>):
  | string
  | null {
  const objectToSerialize: Map<string, unknown> = new Map()
  if (encryptionKey) {
    objectToSerialize.set(ENCRYPTION_KEY_MAP_KEY, encryptionKey)
  }
  if (serviceEndpoints && serviceEndpoints.length) {
    objectToSerialize.set(SERVICES_KEY_MAP_KEY, serviceEndpoints)
  }

  if (!objectToSerialize.size) {
    return null
  }

  return cborEncode(objectToSerialize).toString('base64')
}

export function decodeAndDeserializeAdditionalLightDidDetails(
  rawInput: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  version = 1
): Pick<LightDidDetailsCreationOpts, 'encryptionKey' | 'serviceEndpoints'> {
  const decodedPayload: Map<string, unknown> = cborDecode(rawInput, {
    encoding: 'base64',
  })

  return {
    encryptionKey: decodedPayload[ENCRYPTION_KEY_MAP_KEY],
    serviceEndpoints: decodedPayload[SERVICES_KEY_MAP_KEY],
  }
}
