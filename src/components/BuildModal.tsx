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
  onBuildQueued?: () => void;
}

interface RoomFormData {
  roomName: string;
  exitToNewRoom: string;
  exitFromNewRoom: string;
  description: string;
}

const BuildModal: React.FC<BuildModalProps> = ({ isOpen, onClose, username, currentRoom, onRoomCreated, onBuildQueued }) => {
  const [formData, setFormData] = useState<RoomFormData>({
    roomName: '',
    exitToNewRoom: '',
    exitFromNewRoom: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keychain = new KeychainSDK(window, { rpc: config.hive.nodes[0] });

  // Function to convert room name to permlink format
  const generatePermlink = (roomName: string): string => {
    return roomName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/[^a-z0-9-]/g, '') // Remove any non-alphanumeric characters except dashes
      .replace(/-+/g, '-') // Replace multiple consecutive dashes with single dash
      .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.roomName.trim() || !formData.description.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Generate permlink from room name
      const permlink = generatePermlink(formData.roomName.trim());
      
      // Validate permlink
      if (!permlink) {
        setError('Room name must contain valid characters');
        return;
      }

      // Create the post data
      const postData = {
        username: username!,
        title: formData.roomName.trim(),
        body: formData.description.trim(),
        permlink,
        parent_author: currentRoom?.author || config.game.account,
        parent_perm: 'blog',
        json_metadata: JSON.stringify({
          app: config.game.idName,
          type: 'room',
          format: 'markdown',
          tags: ['ego-death'],
          connection: {
            fromRoom: currentRoom ? {
              author: currentRoom.author,
              permlink: currentRoom.permlink
            } : null,
            exitToNewRoom: formData.exitToNewRoom,
            exitFromNewRoom: formData.exitFromNewRoom
          }
        }),
        comment_options: JSON.stringify({
          author: username!,
          permlink,
          max_accepted_payout: "10000.000 HBD",
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: [],
          percent_hbd: 10000
        })
      };

      // Submit the post
      const postResult = await keychain.post(postData);
      
      if (postResult.success) {
        onClose();
        // Reset form
        setFormData({
          roomName: '',
          exitToNewRoom: '',
          exitFromNewRoom: '',
          description: ''
        });
      } else {
        setError('Failed to create room. Please try again.');
      }
    } catch (err) {
      setError('An error occurred while creating the room.');
    } finally {
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
          <h2>Create New Room</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <p><strong>Room Connection:</strong></p>
            <p>Specify how this new room connects to your current location. The exits will be configured automatically when the room is approved.</p>
          </div>
          {error && (
            <div className="error-message" style={{ color: '#ff4444', marginBottom: '1rem' }}>
              {error}
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
              <label className="modal-form-label" htmlFor="exitToNewRoom">Exit from Current Room:</label>
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