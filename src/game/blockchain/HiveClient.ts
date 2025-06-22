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
} 