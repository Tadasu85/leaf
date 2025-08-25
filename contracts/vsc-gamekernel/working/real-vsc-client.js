import { DID } from 'dids'
import { Client as HiveClient, PrivateKey } from '@hiveio/dhive'
import { KeychainSDK } from 'keychain-sdk'
import { encodePayload } from 'dag-jose-utils'
import Axios from 'axios'
import { submitTxQuery } from './queries.js'
import { TransactionContainerV2, TransactionDbType } from './types.js'
import { base64UrlToUint8Array, convertEIP712Type, getNonce, uint8ArrayToBase64Url } from './utils.js'
import Web3 from 'web3'
import { hashTypedData, recoverTypedDataAddress, recoverAddress } from 'viem'
import { encode, decode } from '@ipld/dag-cbor'

export { hexToUint8Array } from './utils.js'

let hiveClient = new HiveClient('https://api.hive.blog')

export function setHiveAPI(api) {
  hiveClient = new HiveClient(api)
}

class TxBuilder {
  setPayer(payer) {
    return this
  }

  /**
   * Not implemented in VSC network yet
   * @param name
   * @param options
   * @returns
   */
  addIntent(name, options) {
    return this
  }

  /**
   * Not implemented in VSC network yet
   * @param name
   * @returns
   */
  removeIntent(name) {
    return this
  }

  setOp() {
    return this
  }

  asTx() {}
}

export class vTransaction {
  constructor() {
    this.signature = null
    this.txData = null
    this.cachedNonce = null
  }

  async setTx(txData) {
    this.txData = txData
  }

  async sign(did) {}

  async broadcast(client, options) {
    if (!this.txData) {
      throw new Error('No TX specified!')
    }
    
    if (client.loginInfo.type === 'hive') {
      await hiveClient.broadcast.json(
        {
          id: 'vsc.tx',
          required_auths: [client.hiveName],
          required_posting_auths: [],
          json: JSON.stringify({
            __t: 'vsc-tx',
            __v: '0.1',
            net_id: 'testnet/0bf2e474-6b9e-4165-ad4e-a0d78968d20c',
            headers: {},
            tx: this.txData,
          }),
        },
        PrivateKey.fromString(client.secrets.active || client.secrets.posting),
      )
    } else if (client.loginInfo.type === 'offchain') {
      if (!this.cachedNonce) {
        this.cachedNonce = await getNonce(client._did.id, `${client._args.api}/api/v1/graphql`)
      }

      const txData = {
        __v: '0.2',
        __t: 'vsc-tx',
        headers: {
          type: TransactionDbType.input,
          nonce: this.cachedNonce,
          required_auths: [client._did.id],
        },
        tx: this.txData,
      }

      this.cachedNonce = this.cachedNonce + 1

      //Create JWS signed by DID
      const jws = await client._did.createDagJWS(txData)

      //Convert JWS into separate sig & tx data
      const arr = base64UrlToUint8Array(jws.jws.signatures[0].protected)
      const textDecoder = new TextDecoder()
      const decodedString = textDecoder.decode(arr)
      const protectedVal = JSON.parse(decodedString)
      const did = protectedVal.kid.split('#')[0]

      const sigs = [
        {
          alg: protectedVal.alg,
          //Key id copy
          kid: did,
          sig: jws.jws.signatures[0].signature,
        },
      ]
      const sigEncoded = uint8ArrayToBase64Url(
        (
          await encodePayload({
            __t: 'vsc-sig',
            sigs,
          })
        ).linkedBlock,
      )

      const encodedTx = uint8ArrayToBase64Url(jws.linkedBlock)

      const { data } = await Axios.post(`${client._args.api}/api/v1/graphql`, {
        query: submitTxQuery,
        variables: {
          tx: encodedTx,
          sig: sigEncoded,
        },
      })
      
      if (data.data) {
        const submitResult = data.data.submitTransactionV1
        return {
          id: submitResult.id,
        }
      }
    } else if (client.loginInfo.type === 'evm') {
      const did = `did:pkh:eip155:1:${client.loginInfo.id}`
      if (!this.cachedNonce) {
        this.cachedNonce = await getNonce(did, `${client._args.api}/api/v1/graphql`)
      }
      
      const txData = {
        __v: '0.2',
        __t: 'vsc-tx',
        headers: {
          type: TransactionDbType.input,
          nonce: this.cachedNonce,
          required_auths: [`did:pkh:eip155:1:${client.loginInfo.id}`],
        },
        tx: this.txData,
      }
      
      const types = convertEIP712Type(decode(encode(txData)))

      const hash = hashTypedData({
        ...types,
      })
      const signature = client.loginInfo.wallet.sign(hash).signature

      const sigs = [
        {
          t: 'eip191',
          //Key id copy
          s: signature,
        },
      ]
      
      const sigEncoded = uint8ArrayToBase64Url(
        (
          await encodePayload({
            __t: 'vsc-sig',
            sigs,
          })
        ).linkedBlock,
      )
      const txEncoded = uint8ArrayToBase64Url((await encodePayload(txData)).linkedBlock)

      const { data } = await Axios.post(`${client._args.api}/api/v1/graphql`, {
        query: submitTxQuery,
        variables: {
          tx: txEncoded,
          sig: sigEncoded,
        },
      })
      
      if (data.data) {
        const submitResult = data.data.submitTransactionV1
        return {
          id: submitResult.id,
        }
      }
    }
  }
}

export class vClient {
  constructor(args) {
    this.loggedIn = false
    this._args = args
    this.secrets = {}
    this.loginInfo = {
      id: null,
      type: null,
    }
  }

  async call() {}

  async login(did) {
    if (this._args.loginType === 'hive') {
      throw new Error('args.loginType must be set to "offchain"')
    }
    if (!did.authenticated) {
      throw new Error('DID Not authenticated! Must run await did.authenticate()')
    }
    this._did = did
    this.loginInfo.id = did.id
    this.loginInfo.type = 'offchain'
  }

  async loginWithHive(args) {
    if (args.provider === 'hive_keychain') {
      if (!(typeof window !== 'undefined' && window.hive_keychain)) {
        throw new Error('Hive keychain not available')
      }
      this._keychain = new KeychainSDK(window)
      this.loggedIn = true
    } else if (args.provider === 'direct') {
      if (!args.posting && !args.active) {
        throw new Error('Missing posting or active key')
      }
      this.secrets.posting = args.posting
      this.secrets.active = args.active
      this.loggedIn = true
    } else {
      throw new Error('Invalid Provider')
    }
    this.loginInfo.id = args.hiveName
    this.loginInfo.type = 'hive'
  }

  async loginWithETH(web3, address, secret) {
    this.web3 = web3
    this.loginInfo.id = address
    this.loginInfo.type = 'evm'
    this.loginInfo.wallet = web3.eth.accounts.privateKeyToAccount(secret)
    this.loggedIn = true
  }

  async _sign() {}
}

export default vClient
