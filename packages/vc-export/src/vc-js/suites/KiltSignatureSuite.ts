/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

import type {
  DocumentLoader,
  ExpansionMap,
  purposes,
  VerificationResult,
} from 'jsonld-signatures'
import type { JsonLdObj } from 'jsonld/jsonld-spec'
import type { SelfSignedProof } from '../../types'
import { verifySelfSignedProof } from '../../verificationUtils'
import { KiltAbstractSuite } from './KiltAbstractSuite'
import { KILT_SELF_SIGNED_PROOF_TYPE } from '../../constants'

export class KiltSignatureSuite extends KiltAbstractSuite {
  constructor() {
    super({ type: KILT_SELF_SIGNED_PROOF_TYPE, verificationMethod: '<none>' })
  }

  public async verifyProof(options: {
    proof: JsonLdObj
    document: JsonLdObj
    documentLoader: DocumentLoader
    purpose?: purposes.ProofPurpose
    expansionMap?: ExpansionMap
  }): Promise<VerificationResult> {
    try {
      const { document, proof, documentLoader } = options
      if (!document || typeof document !== 'object')
        throw new TypeError('document must be a JsonLd object')
      if (!proof || typeof proof !== 'object')
        throw new TypeError('proof must be a JsonLd object')
      const compactedDoc = await this.compactDoc(document, options)
      const compactedProof = await this.compactProof<SelfSignedProof>(
        proof,
        options
      )
      const { verified, errors } = await verifySelfSignedProof(
        compactedDoc,
        compactedProof,
        documentLoader
      )
      if (errors.length > 0)
        return {
          verified,
          error: errors[0],
        }
      return { verified }
    } catch (e: any) {
      return { verified: false, error: e }
    }
  }
}
