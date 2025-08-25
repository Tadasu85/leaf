import { base64url } from 'multiformats/bases/base64'

export function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}

export function uint8ArrayToBase64Url(uint8Array) {
  return base64url.encode(uint8Array)
}

export function base64UrlToUint8Array(base64String) {
  return base64url.decode(base64String)
}

export async function getNonce(did, apiUrl) {
  // Mock nonce for now - in real implementation this would query the VSC network
  return Math.floor(Math.random() * 1000000)
}

export function convertEIP712Type(data) {
  // Mock EIP-712 type conversion for now
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ]
    },
    primaryType: 'EIP712Domain',
    domain: {
      name: 'VSC',
      version: '1',
      chainId: 1,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    },
    message: data
  }
}
