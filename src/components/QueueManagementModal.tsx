import React, { useState, useEffect } from 'react';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import config from '../config';
import logger from '../utils/Logger';
import { applyApproval } from '../game/rooms/approval';

interface QueueManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  buildApprovalQueue?: () => Promise<any[]>;
  onError?: (error: string) => void; // Add error callback prop
}

interface BuildRequest {
  queueId: string;
  username: string;
  room: {
    author: string;
    permlink: string;
  };
  newRoom: {
    permlink: string;
    author: string;
  };
  title: string;
  body: string;
  exits: {
    fromNewRoom: {
      [key: string]: string;
    };
    fromCurrentRoom: {
      [key: string]: string;
    };
  };
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  timeEvent?: {
    type: string;
    intervalBlocks: number;
    startBlock?: number;
    phases: any[];
  } | null;
}

const QueueManagementModal: React.FC<QueueManagementModalProps> = ({ isOpen, onClose, username, buildApprovalQueue, onError }) => {
  const [buildRequests, setBuildRequests] = useState<BuildRequest[]>([]);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const keychain = new KeychainSDK(window, { rpc: config.hive.nodes[0] });
  const client = new Client([config.hive.nodes[0]]);

  useEffect(() => {
    logger.debug('[Queue Modal] useEffect triggered:', {
      isOpen,
      username,
      gameAccount: config.game.account,
      hasBuildApprovalQueue: !!buildApprovalQueue,
      shouldCall: isOpen && username === config.game.account && buildApprovalQueue
    });
    
    if (isOpen && username === config.game.account && buildApprovalQueue) {
      logger.info('[Queue Modal] Calling buildApprovalQueue...');
      // Build approval queue from blockchain data
      buildApprovalQueue().then(queueData => {
        logger.debug('[Queue Modal] buildApprovalQueue returned:', queueData);
        setBuildRequests(queueData.map((request) => ({
          ...request,
          queueId: request.id
        })));
      }).catch(error => {
        logger.error('Error building approval queue:', error);
      });
    } else {
      logger.debug('[Queue Modal] Not calling buildApprovalQueue - conditions not met');
    }
  }, [isOpen, username, buildApprovalQueue]);

  const handleApprove = async (queueId: string) => {
    if (!username || username !== config.game.account) return;

    setIsUpdating(true);
    try {
      // Get the build request
      const request = buildRequests.find(r => r.queueId === queueId);
      if (!request) throw new Error('Build request not found');

      // Get current game JSON metadata
      const gameInfo = await client.database.getAccounts([config.game.account]);
      // Parse defensively: an empty string means no posting metadata yet
      let currentMetadata: Record<string, any> = {};
      try {
        currentMetadata = JSON.parse(gameInfo[0].posting_json_metadata || '{}') || {};
      } catch (error) {
        throw new Error('Game account metadata is not valid JSON; refusing to overwrite it');
      }
      const currentGameData = currentMetadata.egodeathgamedata || {};
      const currentRooms = currentGameData.rooms_authors_exits || {};

      // Get current block number so time-event rooms start their schedule from approval
      let approvalBlock = 0;
      try {
        approvalBlock = await client.blockchain.getCurrentBlockNum();
      } catch (error) {
        logger.warn('[Queue Modal] Could not fetch current block number for startBlock:', error);
      }

      // Add the new room and connect it to the room it was built from.
      // A permlink another author already uses gets an author/permlink key,
      // so approving never replaces someone else's room.
      const approval = applyApproval(currentRooms, request, approvalBlock);
      if (!approval.ok) throw new Error(approval.reason);
      const updatedRooms = approval.rooms;

      // Merge into the existing metadata so the account's profile and any
      // other keys survive. Previously this replaced the whole object.
      const updatedMetadata = {
        ...currentMetadata,
        egodeathgamedata: {
          ...currentGameData,
          rooms_authors_exits: updatedRooms
        }
      };

      // Update the game account's posting JSON metadata
      const accountUpdateData = {
        username: username,
        operations: [
          [
            "account_update2",
            {
              account: username,
              json_metadata: "",
              posting_json_metadata: JSON.stringify(updatedMetadata)
            }
          ]
        ],
        'method': KeychainKeyTypes.posting
      } as unknown as Broadcast;

      const accountUpdateResult = await keychain.broadcast(accountUpdateData);
      
      if (!accountUpdateResult.success) {
        throw new Error('Failed to update game account metadata');
      }

      // Update local state to show as approved
      setBuildRequests(prev => prev.map(req => 
        req.queueId === queueId ? { ...req, status: 'approved' } : req
      ));

      // Show success message
      alert(`Room "${request.title}" by ${request.username} has been approved and added to the game!\n\nNote: The room has been added with proper exits. The exits have been configured based on the connection information.`);
    } catch (error) {
      logger.error('Error approving build request:', error);
      alert(error instanceof Error ? error.message : 'An error occurred while approving the build request');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = async (queueId: string) => {
    if (!username || username !== config.game.account) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setIsUpdating(true);
    try {
      // Get the build request
      const request = buildRequests.find(r => r.queueId === queueId);
      if (!request) throw new Error('Build request not found');

      // Generate a unique permlink for the rejection comment
      const timestamp = Date.now();
      const permlink = `rejection-${timestamp}`;

      // Create the rejection comment data with the format "Rejected: reason"
      const commentData = {
        username: username,
        body: `Rejected: ${rejectionReason.trim()}`,
        permlink,
        parent_author: request.newRoom.author,
        parent_perm: request.newRoom.permlink,
        parent_username: request.newRoom.author,
        json_metadata: JSON.stringify({
          app: config.game.idName,
          format: 'markdown',
          tags: ['ego-death-rejection'],
          type: 'rejection'
        }),
        comment_options: JSON.stringify({
          author: username,
          permlink,
          max_accepted_payout: "10000.000 HBD",
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: [],
          percent_hbd: 10000
        })
      };

      // Submit the rejection comment
      const commentResult = await keychain.post(commentData);
      
      if (!commentResult.success) {
        throw new Error('Failed to post rejection comment');
      }

      // Update local state to show as rejected
      setBuildRequests(prev => prev.map(req => 
        req.queueId === queueId ? { ...req, status: 'rejected', rejectionReason: rejectionReason.trim() } : req
      ));

      // Show success message
      alert(`Room "${request.title}" by ${request.username} has been rejected with reason: ${rejectionReason.trim()}`);
      
      // Reset form
      setRejectionReason('');
      setSelectedRequest(null);
    } catch (error) {
      logger.error('Error rejecting build request:', error);
      const errorMsg = error instanceof Error ? error.message : 'An error occurred while rejecting the build request';
      if (onError) onError(errorMsg);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal__overlay">
      <div className="modal__content" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal__header">
          <h2>Room Build Queue</h2>
          <button className="modal__close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body">
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <p><strong>New Build Queue System:</strong></p>
            <p>Builders now create rooms directly on the blockchain. This queue shows rooms that have been posted but not yet added to the game map. When you approve a room, it will be added to the game with proper exits that you can configure later.</p>
          </div>
          {buildRequests.length === 0 ? (
            <p>No pending build requests</p>
          ) : (
            <div className="queue-management__list">
              {buildRequests.map(request => (
                <div key={request.queueId} className="queue-management__item" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
                  <h3>Request from {request.username}</h3>
                  <p><strong>Room Title:</strong> {request.title}</p>
                  <p><strong>Room Description:</strong></p>
                  <div style={{ 
                    backgroundColor: '#f9f9f9', 
                    padding: '0.5rem', 
                    borderRadius: '4px', 
                    marginBottom: '0.5rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {request.body}
                  </div>
                  <p><strong>Room Permlink:</strong> {request.newRoom.permlink}</p>
                  <p><strong>From Room:</strong> {request.room.author}/{request.room.permlink}</p>
                  <p><strong>Connection:</strong> {Object.keys(request.exits.fromCurrentRoom)[0]} → {request.newRoom.permlink} → {Object.keys(request.exits.fromNewRoom)[0]}</p>
                  <p><strong>Status:</strong> {request.status}</p>
                  {request.status === 'rejected' && request.rejectionReason && (
                    <p><strong>Rejection Reason:</strong> {request.rejectionReason}</p>
                  )}
                  {request.status === 'pending' && (
                    <div className="queue-management__actions">
                      <button
                        onClick={() => handleApprove(request.queueId)}
                        disabled={isUpdating}
                        className="queue-management__approve-button"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setSelectedRequest(request.queueId)}
                        disabled={isUpdating}
                        className="queue-management__reject-button"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {selectedRequest === request.queueId && (
                    <div className="queue-management__rejection-form" style={{ marginTop: '1rem' }}>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Enter reason for rejection..."
                        style={{ width: '100%', marginBottom: '0.5rem' }}
                      />
                      <button
                        onClick={() => handleReject(request.queueId)}
                        disabled={isUpdating}
                        className="queue-management__submit-rejection-button"
                      >
                        Submit Rejection
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QueueManagementModal; 