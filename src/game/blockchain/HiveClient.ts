import { Client, Operation } from '@hiveio/dhive';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Location } from '../types/GameTypes';
import config from '../../config';

export class HiveClient {
  private client: Client;
  private keychain: KeychainSDK;

  constructor() {
    this.client = new Client(config.hive.nodes);
    this.keychain = new KeychainSDK(window);
  }

  public async moveTo(username: string, location: Location): Promise<void> {
    const operation: Operation = [
      'custom_json',
      {
        required_auths: [],
        required_posting_auths: [username],
        id: config.game.idName,
        json: JSON.stringify({
          move_to: {
            Location: {
              author: location.author,
              permlink: location.permlink
            }
          }
        })
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    await this.keychain.broadcast(broadcastData);
  }

  public getClient(): Client {
    return this.client;
  }

  public get database() {
    return this.client.database;
  }

  public async getComments(author: string, permlink: string): Promise<any[]> {
    try {
      console.log(`[HiveClient Debug] Fetching comments for ${author}/${permlink}`);
      const replies = await this.client.database.call('get_content_replies', [
        author,
        permlink
      ]);
      
      console.log(`[HiveClient Debug] Found ${replies.length} comments`);
      return replies || [];
    } catch (error) {
      console.error('[HiveClient Debug] Error fetching comments:', error);
      return [];
    }
  }
} 