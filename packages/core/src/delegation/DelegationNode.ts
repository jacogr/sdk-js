/**
 * Copyright 2018-2021 BOTLabs GmbH.
 *
 * This source code is licensed under the BSD 4-Clause "Original" license
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Delegation nodes are used within the KILT protocol to construct the trust hierarchy.
 *
 * Starting from the root node, entities can delegate the right to issue attestations to Claimers for a certain CTYPE and also delegate the right to attest and to delegate further nodes.
 *
 * A delegation object is stored on-chain, and can be revoked.
 *
 * A delegation can and may restrict permissions.
 *
 * Permissions:
 *   * Delegate.
 *   * Attest.
 *
 * @packageDocumentation
 * @module DelegationNode
 * @preferred
 */

import {
  IDelegationHierarchyDetails,
  IDelegationNode,
  IDidDetails,
  KeyRelationship,
  KeystoreSigner,
  SubmittableExtrinsic,
} from '@kiltprotocol/types'
import { Crypto, SDKErrors, UUID } from '@kiltprotocol/utils'
import { ConfigService } from '@kiltprotocol/config'
import { DidTypes, DidUtils } from '@kiltprotocol/did'
import { BN } from '@polkadot/util'
import type { DelegationHierarchyDetailsRecord } from './DelegationDecoder'
import { query as queryAttestation } from '../attestation/Attestation.chain'
import {
  getChildren,
  getAttestationHashes,
  query,
  queryDepositAmount,
  remove,
  revoke,
  storeAsDelegation,
  storeAsRoot,
  reclaimDeposit,
} from './DelegationNode.chain'
import { query as queryDetails } from './DelegationHierarchyDetails.chain'
import * as DelegationNodeUtils from './DelegationNode.utils'
import { Attestation } from '../attestation/Attestation'

const log = ConfigService.LoggingFactory.getLogger('DelegationNode')

type NewDelegationNodeInput = Required<
  Pick<IDelegationNode, 'hierarchyId' | 'parentId' | 'account' | 'permissions'>
>

type NewDelegationRootInput = Pick<IDelegationNode, 'account' | 'permissions'> &
  DelegationHierarchyDetailsRecord

export class DelegationNode implements IDelegationNode {
  public readonly id: IDelegationNode['id']
  public readonly hierarchyId: IDelegationNode['hierarchyId']
  public readonly parentId?: IDelegationNode['parentId']
  private childrenIdentifiers: Array<IDelegationNode['id']> = []
  public readonly account: IDidDetails['did']
  public readonly permissions: IDelegationNode['permissions']
  private hierarchyDetails?: IDelegationHierarchyDetails
  public readonly revoked: boolean

  // eslint-disable-next-line jsdoc/require-param
  /**
   * Creates a new [DelegationNode] from an [IDelegationNode].
   *
   */
  public constructor({
    id,
    hierarchyId,
    parentId,
    childrenIds,
    account,
    permissions,
    revoked,
  }: IDelegationNode) {
    this.id = id
    this.hierarchyId = hierarchyId
    this.parentId = parentId
    this.childrenIdentifiers = childrenIds
    this.account = account
    this.permissions = permissions
    this.revoked = revoked
    DelegationNodeUtils.errorCheck(this)
  }

  public get childrenIds(): Array<IDelegationNode['id']> {
    return this.childrenIdentifiers
  }

  /**
   * Builds a new [DelegationNode] representing a regular delegation node ready to be submitted to the chain for creation.
   *
   * @param input - An partial [IDelegationNode] input object.
   * @param input.hierarchyId - The delegation hierarchy under which to store the node.
   * @param input.parentId - The parent node under which to store the node.
   * @param input.account - The owner (i.e., delegate) of this delegation.
   * @param input.permissions - The set of permissions associated with this delegation node.
   * @returns A new [DelegationNode] with a randomly generated id.
   */
  public static newNode({
    hierarchyId,
    parentId, // Cannot be undefined here
    account,
    permissions,
  }: NewDelegationNodeInput): DelegationNode {
    return new DelegationNode({
      id: UUID.generate(),
      hierarchyId,
      parentId,
      account,
      permissions,
      childrenIds: [],
      revoked: false,
    })
  }

  /**
   * Builds a new [DelegationNode] representing a root delegation node ready to be submitted to the chain for creation.
   *
   * @param input - An input object.
   * @param input.account - The address of this delegation (and of the whole hierarchy under it).
   * @param input.permissions - The set of permissions associated with this delegation node.
   * @param input.cTypeHash - The cTypeHash associated with the entire hierarchy.
   * @returns A new [DelegationNode] with a randomly generated id.
   */
  public static newRoot({
    account,
    permissions,
    cTypeHash,
  }: NewDelegationRootInput): DelegationNode {
    const nodeId = UUID.generate()

    const newNode = new DelegationNode({
      id: nodeId,
      hierarchyId: nodeId,
      account,
      permissions,
      childrenIds: [],
      revoked: false,
    })
    newNode.hierarchyDetails = {
      id: nodeId,
      cTypeHash,
    }

    return newNode
  }

  /**
   * Lazily fetches the details of the hierarchy the node is part of and return its CType.
   *
   * @returns The CType hash associated with the delegation hierarchy.
   */
  public async getCTypeHash(): Promise<string> {
    return this.getHierarchyDetails().then((details) => details.cTypeHash)
  }

  /**
   * [ASYNC] Fetches the details of the hierarchy this delegation node belongs to.
   *
   * @throws [[ERROR_HIERARCHY_QUERY]] when the hierarchy details could not be queried.
   * @returns Promise containing the [[DelegationHierarchyDetails]] of this delegation node.
   */
  public async getHierarchyDetails(): Promise<IDelegationHierarchyDetails> {
    if (!this.hierarchyDetails) {
      const hierarchyDetails = await queryDetails(this.hierarchyId)
      if (!hierarchyDetails) {
        throw SDKErrors.ERROR_HIERARCHY_QUERY(this.hierarchyId)
      }
      this.hierarchyDetails = hierarchyDetails
      return hierarchyDetails
    }
    return this.hierarchyDetails
  }

  /**
   * [ASYNC] Fetches the parent node of this delegation node.
   *
   * @returns Promise containing the parent as [[DelegationNode]] or [null].
   */
  public async getParent(): Promise<DelegationNode | null> {
    return this.parentId ? query(this.parentId) : null
  }

  /**
   * [ASYNC] Fetches the children nodes of this delegation node.
   *
   * @returns Promise containing the children as an array of [[DelegationNode]], which is empty if there are no children.
   */
  public async getChildren(): Promise<DelegationNode[]> {
    const refreshedNodeDetails = await query(this.id)
    // Updates the children info with the latest information available on chain.
    if (refreshedNodeDetails) {
      this.childrenIdentifiers = refreshedNodeDetails.childrenIds
    }
    return getChildren(this)
  }

  /**
   * [ASYNC] Fetches and resolves all attestations attested with this delegation node.
   *
   * @returns Promise containing all resolved attestations attested with this node.
   */
  public async getAttestations(): Promise<Attestation[]> {
    const attestationHashes = await this.getAttestationHashes()
    const attestations = await Promise.all(
      attestationHashes.map((claimHash: string) => {
        return queryAttestation(claimHash)
      })
    )

    return attestations.filter((value): value is Attestation => !!value)
  }

  /**
   * [ASYNC] Fetches all hashes of attestations attested with this delegation node.
   *
   * @returns Promise containing all attestation hashes attested with this node.
   */
  public async getAttestationHashes(): Promise<string[]> {
    return getAttestationHashes(this.id)
  }

  /**
   *
   * Generates the delegation hash from the delegations' property values.
   *
   * This hash is signed by the delegate and later stored along with the delegation to
   * make sure delegation data (such as permissions) has not been tampered with.
   *
   * @returns The hash representation of this delegation **as a hex string**.
   */
  public generateHash(): string {
    const propsToHash: Array<Uint8Array | string> = [this.id, this.hierarchyId]
    if (this.parentId) {
      propsToHash.push(this.parentId)
    }
    const uint8Props: Uint8Array[] = propsToHash.map((value) => {
      return Crypto.coToUInt8(value)
    })
    uint8Props.push(DelegationNodeUtils.permissionsAsBitset(this))
    const generated: string = Crypto.u8aToHex(
      Crypto.hash(Crypto.u8aConcat(...uint8Props), 256)
    )
    log.debug(`generateHash(): ${generated}`)
    return generated
  }

  /**
   * Signs the delegation hash from the delegations' property values.
   *
   * This is required to anchor the delegation node on chain in order to enforce the delegee's consent.
   *
   * @param delegeeDid The DID of the delegee.
   * @param signer The keystore responsible for signing the delegation creation details for the delegee.
   * @example
   * ```
   * // Sign the hash of the delegation node...
   * let myNewDelegation: DelegationNode
   * let myDidDetails: IDidDetails
   * let myKeyStore: Keystore
   * const signature:string = await myNewDelegation.delegeeSign(myDidDetails, myKeyStore)
   *
   * // produce the extrinsic that stores the delegation node on the Kilt chain
   * const extrinsic = await newDelegationNode.store(signature)
   *
   * // now the delegating DID must sign as well
   * const submittable = await delegator.authorizeExtrinsic(extrinsic, delegtorsKeystore, submitterAccount)
   *
   * // and we can put it on chain
   * await submittable.signAndSend()
   * ```
   * @returns The DID signature over the delegation **as a hex string**.
   */
  public async delegeeSign(
    delegeeDid: IDidDetails,
    signer: KeystoreSigner
  ): Promise<DidTypes.SignatureEnum> {
    const { alg, signature } = await DidUtils.signWithDid(
      Crypto.coToUInt8(this.generateHash()),
      delegeeDid,
      signer,
      KeyRelationship.authentication
    )
    return { [alg]: signature }
  }

  /**
   * [ASYNC] Syncronise the delegation node state with the latest state as stored on the blockchain.
   *
   * @returns An updated instance of the same [DelegationNode] containing the up-to-date state fetched from the chain.
   */
  public async getLatestState(): Promise<DelegationNode> {
    const newNodeState = await query(this.id)
    if (!newNodeState) {
      throw SDKErrors.ERROR_DELEGATION_ID_MISSING
    }
    return newNodeState
  }

  /**
   * [ASYNC] Stores the delegation node on chain.
   *
   * @param signature Signature of the delegate to ensure it is done under the delegate's permission.
   * @returns Promise containing an unsigned SubmittableExtrinsic.
   */
  public async store(
    signature?: DidTypes.SignatureEnum
  ): Promise<SubmittableExtrinsic> {
    if (this.isRoot()) {
      return storeAsRoot(this)
      // eslint-disable-next-line no-else-return
    } else {
      if (!signature) {
        throw SDKErrors.ERROR_DELEGATION_SIGNATURE_MISSING
      }
      return storeAsDelegation(this, signature)
    }
  }

  isRoot(): boolean {
    return this.id === this.hierarchyId && !this.parentId
  }

  /**
   * [ASYNC] Verifies the delegation node by querying it from chain and checking its revocation status.
   *
   * @returns Promise containing a boolean flag.
   */
  public async verify(): Promise<boolean> {
    const node = await query(this.id)
    return node !== null && !node.revoked
  }

  /**
   * [ASYNC] Checks on chain whether a identity with the given DID is delegating to the current node.
   *
   * @param did The DID to search for.
   *
   * @returns An object containing a `node` owned by the identity if it is delegating, plus the number of `steps` traversed. `steps` is 0 if the DID is owner of the current node.
   */
  public async findAncestorOwnedBy(
    did: IDidDetails['did']
  ): Promise<{ steps: number; node: DelegationNode | null }> {
    if (this.account === did) {
      return {
        steps: 0,
        node: this,
      }
    }
    const parent = await this.getParent()
    if (parent) {
      const result = await parent.findAncestorOwnedBy(did)
      result.steps += 1
      return result
    }
    return {
      steps: 0,
      node: null,
    }
  }

  /**
   * [ASYNC] Recursively counts all nodes that descend from the current node (excluding the current node). It is important to first refresh the state of the node from the chain.
   *
   * @returns Promise resolving to the node count.
   */
  public async subtreeNodeCount(): Promise<number> {
    const children = await this.getChildren()
    if (children.length === 0) {
      return 0
    }
    const childrensChildCounts = await Promise.all(
      children.map((child) => child.subtreeNodeCount())
    )
    return (
      children.length +
      childrensChildCounts.reduce((previous, current) => previous + current)
    )
  }

  /**
   * [ASYNC] Revokes the delegation node on chain.
   *
   * @param did The address of the identity used to revoke the delegation.
   * @returns Promise containing an unsigned SubmittableExtrinsic.
   */
  public async revoke(did: IDidDetails['did']): Promise<SubmittableExtrinsic> {
    const { steps, node } = await this.findAncestorOwnedBy(did)
    if (!node) {
      throw SDKErrors.ERROR_UNAUTHORIZED(
        `The DID ${did} is not among the delegators and may not revoke this node`
      )
    }
    const childCount = await this.subtreeNodeCount()
    log.debug(
      `:: revoke(${this.id}) with maxRevocations=${childCount} and maxDepth = ${steps} through delegation node ${node?.id} and identity ${did}`
    )
    return revoke(this.id, steps, childCount)
  }

  /**
   * [ASYNC] Removes the delegation node from the chain.
   *
   * @returns Promise containing an unsigned SubmittableExtrinsic.
   */
  public async remove(): Promise<SubmittableExtrinsic> {
    const childCount = await this.subtreeNodeCount()
    log.debug(`:: remove(${this.id}) with maxRevocations=${childCount}`)
    return remove(this.id, childCount)
  }

  /**
   * [ASYNC] Reclaims the deposit of a delegation and removes the delegation and all its children.
   *
   * This call can only be successfully executed if the submitter of the transaction is the original payer of the delegation deposit.
   *
   * @returns A promise containing the unsigned SubmittableExtrinsic (submittable transaction).
   */
  public async reclaimDeposit(): Promise<SubmittableExtrinsic> {
    const childCount = await this.subtreeNodeCount()
    log.debug(`:: reclaimDeposit(${this.id}) with maxRemovals=${childCount}`)
    return reclaimDeposit(this.id, childCount)
  }

  /**
   * [STATIC] [ASYNC] Queries the delegation node with its [delegationId].
   *
   * @param delegationId The unique identifier of the desired delegation.
   * @returns Promise containing the [[DelegationNode]] or [null].
   */
  public static async query(
    delegationId: string
  ): Promise<DelegationNode | null> {
    log.info(`:: query('${delegationId}')`)
    const result = await query(delegationId)
    log.info(`result: ${JSON.stringify(result)}`)
    return result
  }

  /**
   * [STATIC] Query and return the amount of KILTs (in femto notation) needed to deposit in order to create a delegation.
   *
   * @returns The amount of femtoKILTs required to deposit to create the delegation.
   */
  public static queryDepositAmount(): Promise<BN> {
    return queryDepositAmount()
  }
}
