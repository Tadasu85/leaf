import React, { useState, useEffect } from 'react';
import { KeychainSDK } from 'keychain-sdk';
import config from '../config';

interface BuildModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  currentRoom: {
    author: string;
    permlink: string;
  } | null;
  onRoomCreated?: () => void;
  socket?: any; // Make socket optional
}

interface RoomFormData {
  roomName: string;
  exitToNewRoom: string;
  exitFromNewRoom: string;
  description: string;
}

const BuildModal: React.FC<BuildModalProps> = ({ isOpen, onClose, username, currentRoom, onRoomCreated, socket }) => {
  const [formData, setFormData] = useState<RoomFormData>({
    roomName: '',
    exitToNewRoom: '',
    exitFromNewRoom: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string>('');

  const keychain = new KeychainSDK(window, { rpc: config.hive.node });

  // Set up socket listeners for queue status
  useEffect(() => {
    if (!socket) return;

    const handleQueueStatus = (data: { queueId: string; status: string; message?: string }) => {
      if (data.queueId === queueId) {
        setBuildStatus(data.status);
        if (data.message) {
          setError(data.message);
        }
        if (data.status === 'completed') {
          setIsSubmitting(false);
          onClose();
          if (onRoomCreated) {
            onRoomCreated();
          }
        } else if (data.status === 'failed') {
          setIsSubmitting(false);
        }
      }
    };

    socket.on('queueStatus', handleQueueStatus);

    return () => {
      socket.off('queueStatus', handleQueueStatus);
    };
  }, [socket, queueId, onClose, onRoomCreated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const createPermlink = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submit attempt with:', { 
      username, 
      currentRoom, 
      formData 
    });

    if (!username) {
      setError('You must be logged in to build.');
      return;
    }

    if (!currentRoom) {
      console.error('Current room is null or undefined');
      setError('You must be in a room to build.');
      return;
    }

    if (!currentRoom.author || !currentRoom.permlink) {
      console.error('Current room is missing author or permlink:', currentRoom);
      setError('Invalid room data. Please try moving to another room and try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setBuildStatus('');

    try {
      // Create permlink from room name
      const permlink = createPermlink(formData.roomName);
      console.log('Generated permlink:', permlink);

      // Create the post data
      const postData = {
        data: {
          username: username,
          title: formData.roomName,
          body: formData.description,
          permlink: permlink,
          parent_perm: "blog",
          json_metadata: JSON.stringify({
            app: config.game.idName,
            type: 'room'
          }),
          comment_options: JSON.stringify({
            author: username,
            permlink: permlink,
            max_accepted_payout: "10000.000 HBD",
            allow_votes: true,
            allow_curation_rewards: true,
            extensions: [],
            percent_hbd: 10000
          })
        }
      };

      console.log('Post data:', postData);

      const postResult = await keychain.post(postData.data);
      
      console.log('Post result:', postResult);
      
      if (!postResult.success) {
        throw new Error('Failed to create room post');
      }

      // Queue the room build request
      const queueData = {
        room: currentRoom,
        newRoom: {
          permlink,
          author: username
        },
        exits: {
          fromNewRoom: {
            [formData.exitFromNewRoom]: currentRoom.permlink
          },
          fromCurrentRoom: {
            [formData.exitToNewRoom]: permlink
          }
        }
      };

      console.log('Queueing build request:', queueData);

      // Emit the queue request and store the queue ID
      socket?.emit('queueRoomBuild', queueData, (response: { queueId: string }) => {
        if (response && response.queueId) {
          setQueueId(response.queueId);
          setBuildStatus('queued');
        }
      });

    } catch (error) {
      console.error('Error creating room:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while creating the room');
      setIsSubmitting(false);
    }
  };

  // Add debug logging for props changes
  useEffect(() => {
    //console.log('BuildModal props updated:', { username, currentRoom });
  }, [username, currentRoom]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Build New Room</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ color: '#ff4444', marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          {buildStatus && (
            <div className="build-status" style={{ 
              color: buildStatus === 'failed' ? '#ff4444' : '#44aa44',
              marginBottom: '1rem' 
            }}>
              Build Status: {buildStatus}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="roomName">Room Name:</label>
              <input
                className="modal-form-input"
                type="text"
                id="roomName"
                name="roomName"
                value={formData.roomName}
                onChange={handleInputChange}
                required
                placeholder="Enter room name"
                disabled={isSubmitting}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="exitToNewRoom">Exit to New Room:</label>
              <input
                className="modal-form-input"
                type="text"
                id="exitToNewRoom"
                name="exitToNewRoom"
                value={formData.exitToNewRoom}
                onChange={handleInputChange}
                required
                placeholder="e.g., north, south, east, west"
                disabled={isSubmitting}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="exitFromNewRoom">Exit from New Room:</label>
              <input
                className="modal-form-input"
                type="text"
                id="exitFromNewRoom"
                name="exitFromNewRoom"
                value={formData.exitFromNewRoom}
                onChange={handleInputChange}
                required
                placeholder="e.g., north, south, east, west"
                disabled={isSubmitting}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="description">Room Description:</label>
              <textarea
                className="modal-form-textarea"
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                placeholder="Describe the room..."
                rows={4}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-actions">
              <button 
                type="submit" 
                className="submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating Room...' : 'Create Room'}
              </button>
              <button 
                type="button" 
                className="cancel-button" 
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BuildModal; 