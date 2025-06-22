import { useMemo } from 'react';
import { Client } from '@hiveio/dhive';
import { KeychainSDK } from 'keychain-sdk';
import config from '../config';

export function useClients() {
  const hivenode = config.hive.nodes[0];
  
  const client = useMemo(() => new Client([hivenode]), [hivenode]);
  const keychain = useMemo(() => new KeychainSDK(window, { rpc: hivenode }), [hivenode]);

  return {
    client,
    keychain
  };
} 