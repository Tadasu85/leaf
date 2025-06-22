import React, { useState, useEffect } from 'react';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import config from '../config';

interface QueueManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  socket?: any;
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

const QueueManagementModal: React.FC<QueueManagementModalProps> = ({ isOpen, onClose, username, socket }) => {
  const [buildRequests, setBuildRequests] = useState<BuildRequest[]>([]);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const keychain = new KeychainSDK(window, { rpc: config.hive.nodes[0] });
  const client = new Client([config.hive.nodes[0]]);

  useEffect(() => {
    if (isOpen && username === config.game.accountName) {
      // Request current queue status
      if (socket) {
        socket.emit('getBuildQueue');
      }
    }
  }, [isOpen, username, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleQueueStatus = (queueData: any[]) => {
      setBuildRequests(queueData.map((request) => ({
        ...request,
        queueId: request.id
      })));
    };

    socket.on('buildQueueStatus', handleQueueStatus);

    return () => {
      socket.off('buildQueueStatus', handleQueueStatus);
    };
  }, [socket]);

  const handleApprove = async (queueId: string) => {
    if (!username || username !== config.game.accountName) return;

    setIsUpdating(true);
    try {
      // Get the build request
      const request = buildRequests.find(r => r.queueId === queueId);
      if (!request) throw new Error('Build request not found');

      // Get current game JSON metadata
      const gameInfo = await client.database.getAccounts([config.game.accountName]);
      const currentMetadata = JSON.parse(gameInfo[0].posting_json_metadata);
      const currentGameData = currentMetadata.egodeathgamedata || {};
      const currentRooms = currentGameData.rooms_authors_exits || {};

      // Create updated rooms object
      const updatedRooms = {
        ...currentRooms,
        // Add new room
        [request.newRoom.permlink]: {
          author: request.newRoom.author,
          exits: request.exits.fromNewRoom
        },
        // Update current room's exits
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

      // First, update the game account's posting JSON metadata
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

      // Then, broadcast the custom_json operation for game state update
      const gameData = {
        username: username,
        operations: [
          [
            "custom_json",
            {
              required_auths: [],
              required_posting_auths: [username],
              id: config.game.idName,
              json: JSON.stringify({
                update_room_exits: {
                  metadata: updatedMetadata
                }
              })
            }
          ]
        ],
        'method': KeychainKeyTypes.posting
      } as unknown as Broadcast;

      const gameResult = await keychain.broadcast(gameData);
      
      if (!gameResult.success) {
        throw new Error('Failed to update game exits for new room');
      }

      // Notify the builder
      if (socket) {
        socket.emit('approveRoomBuild', { queueId });
      }
      
      // Update local state
      setBuildRequests(prev => prev.map(req => 
        req.queueId === queueId ? { ...req, status: 'approved' } : req
      ));
    } catch (error) {
      console.error('Error approving build request:', error);
      alert(error instanceof Error ? error.message : 'An error occurred while approving the build request');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = (queueId: string) => {
    if (!username || username !== config.game.accountName) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    if (socket) {
      socket.emit('rejectRoomBuild', { queueId, reason: rejectionReason });
    }
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
          {buildRequests.length === 0 ? (
            <p>No pending build requests</p>
          ) : (
            <div className="queue-list">
              {buildRequests.map(request => (
                <div key={request.queueId} className="queue-item" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
                  <h3>Request from {request.username}</h3>
                  <p><strong>New Room:</strong> {request.newRoom.permlink}</p>
                  <p><strong>From Room:</strong> {request.room.permlink}</p>
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