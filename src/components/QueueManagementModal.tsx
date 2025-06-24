import React, { useState, useEffect } from 'react';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import config from '../config';

interface QueueManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  buildApprovalQueue?: () => Promise<any[]>;
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
}

const QueueManagementModal: React.FC<QueueManagementModalProps> = ({ isOpen, onClose, username, buildApprovalQueue }) => {
  const [buildRequests, setBuildRequests] = useState<BuildRequest[]>([]);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const keychain = new KeychainSDK(window, { rpc: config.hive.nodes[0] });
  const client = new Client([config.hive.nodes[0]]);

  useEffect(() => {
    if (isOpen && username === config.game.account && buildApprovalQueue) {
      // Build approval queue from blockchain data
      buildApprovalQueue().then(queueData => {
        setBuildRequests(queueData.map((request) => ({
          ...request,
          queueId: request.id
        })));
      }).catch(error => {
        console.error('Error building approval queue:', error);
      });
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
      const currentMetadata = JSON.parse(gameInfo[0].posting_json_metadata);
      const currentGameData = currentMetadata.egodeathgamedata || {};
      const currentRooms = currentGameData.rooms_authors_exits || {};

      // Create updated rooms object - add the new room with proper exits
      const updatedRooms = {
        ...currentRooms,
        // Add new room with exits from the connection info
        [request.newRoom.permlink]: {
          author: request.newRoom.author,
          exits: request.exits.fromNewRoom
        },
        // Update the current room's exits to point to the new room
        [request.room.permlink]: {
          author: currentRooms[request.room.permlink]?.author || request.room.author,
          exits: {
            ...(currentRooms[request.room.permlink]?.exits || {}),
            ...request.exits.fromCurrentRoom
          }
        }
      };

      // Create the complete updated metadata
      const updatedMetadata = {
        egodeathgamedata: {
          rooms_authors_exits: updatedRooms
        },
        profile: {
          collections: "",
          topics: [],
          version: 2
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
      console.error('Error approving build request:', error);
      alert(error instanceof Error ? error.message : 'An error occurred while approving the build request');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = (queueId: string) => {
    if (!username || username !== config.game.account) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    // For now, just remove from local state since we don't have a rejection mechanism
    setBuildRequests(prev => prev.filter(req => req.queueId !== queueId));
    setRejectionReason('');
    setSelectedRequest(null);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <h2>Room Build Queue</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <p><strong>New Build Queue System:</strong></p>
            <p>Builders now create rooms directly on the blockchain. This queue shows rooms that have been posted but not yet added to the game map. When you approve a room, it will be added to the game with proper exits that you can configure later.</p>
          </div>
          {buildRequests.length === 0 ? (
            <p>No pending build requests</p>
          ) : (
            <div className="queue-list">
              {buildRequests.map(request => (
                <div key={request.queueId} className="queue-item" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
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
                    <div className="queue-actions">
                      <button
                        onClick={() => handleApprove(request.queueId)}
                        disabled={isUpdating}
                        className="approve-button"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setSelectedRequest(request.queueId)}
                        disabled={isUpdating}
                        className="reject-button"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {selectedRequest === request.queueId && (
                    <div className="rejection-form" style={{ marginTop: '1rem' }}>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Enter reason for rejection..."
                        style={{ width: '100%', marginBottom: '0.5rem' }}
                      />
                      <button
                        onClick={() => handleReject(request.queueId)}
                        disabled={isUpdating}
                        className="submit-rejection-button"
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