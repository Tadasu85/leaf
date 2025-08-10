/**
 * Example VSC Contract for Leaf Game Logic
 * 
 * This demonstrates how to create a basic game contract using the VSC client.
 * In practice, this would be deployed to the VSC network and called by Leaf.
 */

import { vClient, vTransaction } from '@vsc.eco/client'

// Example contract interface - this would be the actual contract deployed on VSC
interface GameContract {
  // Room entry/exit
  onEnter(roomId: string, player: string): Promise<VerbResult>
  onLeave(roomId: string, player: string): Promise<VerbResult>
  
  // Communication
  onSay(roomId: string, player: string, message: string): Promise<VerbResult>
  onEmote(roomId: string, player: string, emote: string): Promise<VerbResult>
  
  // Custom commands
  onCommand(roomId: string, player: string, command: string): Promise<VerbResult>
}

// Example contract implementation using VSC client
export class VSCGameContract implements GameContract {
  private client: vClient
  private contractId: string

  constructor(apiUrl: string, contractId: string) {
    this.client = new vClient({
      api: apiUrl,
      loginType: 'offchain'
    })
    this.contractId = contractId
  }

  async onEnter(roomId: string, player: string): Promise<VerbResult> {
    const tx = new vTransaction()
    tx.setTx({
      op: 'call_contract',
      action: 'onEnter',
      contract_id: this.contractId,
      payload: { roomId, player }
    })

    try {
      const result = await tx.broadcast(this.client)
      return {
        success: true,
        effects: [
          { type: 'Broadcast', roomId, message: `${player} enters the room.` }
        ]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async onLeave(roomId: string, player: string): Promise<VerbResult> {
    const tx = new vTransaction()
    tx.setTx({
      op: 'call_contract',
      action: 'onLeave',
      contract_id: this.contractId,
      payload: { roomId, player }
    })

    try {
      const result = await tx.broadcast(this.client)
      return {
        success: true,
        effects: [
          { type: 'Broadcast', roomId, message: `${player} leaves the room.` }
        ]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async onSay(roomId: string, player: string, message: string): Promise<VerbResult> {
    const tx = new vTransaction()
    tx.setTx({
      op: 'call_contract',
      action: 'onSay',
      contract_id: this.contractId,
      payload: { roomId, player, message }
    })

    try {
      const result = await tx.broadcast(this.client)
      return {
        success: true,
        effects: [
          { type: 'Broadcast', roomId, message: `${player} says: ${message}` }
        ]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async onEmote(roomId: string, player: string, emote: string): Promise<VerbResult> {
    const tx = new vTransaction()
    tx.setTx({
      op: 'call_contract',
      action: 'onEmote',
      contract_id: this.contractId,
      payload: { roomId, player, emote }
    })

    try {
      const result = await tx.broadcast(this.client)
      return {
        success: true,
        effects: [
          { type: 'Broadcast', roomId, message: `${player} ${emote}` }
        ]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async onCommand(roomId: string, player: string, command: string): Promise<VerbResult> {
    const tx = new vTransaction()
    tx.setTx({
      op: 'call_contract',
      action: 'onCommand',
      contract_id: this.contractId,
      payload: { roomId, player, command }
    })

    try {
      const result = await tx.broadcast(this.client)
      
      // Example command handling
      if (command === 'inspect') {
        return {
          success: true,
          effects: [
            { type: 'Broadcast', roomId, message: `${player} inspects the room carefully.` }
          ]
        }
      }
      
      return {
        success: true,
        effects: [
          { type: 'Broadcast', roomId, message: `${player} tries: ${command}` }
        ]
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // Helper method to authenticate with DID
  async authenticate(did: any) {
    await this.client.login(did)
  }

  // Helper method to authenticate with Hive Keychain
  async authenticateWithHive(hiveName: string) {
    await this.client.loginWithHive({
      hiveName,
      provider: 'hive_keychain'
    })
  }
}

// Types that match Leaf's expected interface
export interface VerbResult {
  success: boolean
  effects?: Effect[]
  error?: string
}

export interface Effect {
  type: 'SetDetail' | 'ClearDetail' | 'SetExit' | 'ClearExit' | 'Broadcast'
  roomId?: string
  detail?: string
  value?: string
  exit?: string
  message?: string
}

// Usage example
export async function createGameContract(apiUrl: string, contractId: string): Promise<VSCGameContract> {
  const contract = new VSCGameContract(apiUrl, contractId)
  
  // Note: Authentication would need to be done separately
  // await contract.authenticate(did)
  // or
  // await contract.authenticateWithHive('your-hive-name')
  
  return contract
}
