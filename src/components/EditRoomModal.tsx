import React, { useState, useEffect } from 'react';
import { KeychainSDK } from 'keychain-sdk';
import config from '../config';

interface EditRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  currentRoom: {
    author: string;
    permlink: string;
    title: string;
    description: string;
  } | null;
  onRoomUpdated?: () => void;
}

interface RoomFormData {
  roomName: string;
  description: string;
}

const EditRoomModal: React.FC<EditRoomModalProps> = ({ 
  isOpen, 
  onClose, 
  username, 
  currentRoom, 
  onRoomUpdated 
}) => {
  const [formData, setFormData] = useState<RoomFormData>({
    roomName: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const keychain = new KeychainSDK(window, { rpc: config.hive.nodes[0] });

  // Load existing room data when modal opens
  useEffect(() => {
    if (isOpen && currentRoom) {
      setIsLoading(true);
      setFormData({
        roomName: currentRoom.title,
        description: currentRoom.description
      });
      setIsLoading(false);
    }
  }, [isOpen, currentRoom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !currentRoom) {
      setError('You must be logged in and in a room to edit it.');
      return;
    }

    if (!formData.roomName.trim() || !formData.description.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    // Check if user is the author of the room
    if (username !== currentRoom.author) {
      setError('You can only edit rooms that you created.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Create the update post data (using comment operation with same permlink)
      const updateData = {
        username: username,
        title: formData.roomName.trim(),
        body: formData.description.trim(),
        permlink: currentRoom.permlink, // Use the same permlink to update the post
        parent_author: '', // Empty for top-level posts
        parent_perm: '', // Empty for top-level posts
        json_metadata: JSON.stringify({
          app: config.game.idName,
          type: 'room',
          format: 'markdown',
          tags: ['ego-death'],
          // Preserve any existing connection metadata if it exists
          connection: {
            fromRoom: null, // This will be preserved from the original post
            exitToNewRoom: '',
            exitFromNewRoom: ''
          }
        }),
        comment_options: JSON.stringify({
          author: username,
          permlink: currentRoom.permlink,
          max_accepted_payout: "10000.000 HBD",
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: [],
          percent_hbd: 10000
        })
      };

      // Submit the update using the same permlink (this updates the existing post)
      const updateResult = await keychain.post(updateData);
      
      if (updateResult.success) {
        onClose();
        // Reset form
        setFormData({
          roomName: '',
          description: ''
        });
        if (onRoomUpdated) {
          onRoomUpdated();
        }
      } else {
        setError('Failed to update room. Please try again.');
      }
    } catch (error) {
      console.error('Error updating room:', error);
      setError('An error occurred while updating the room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Room</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <p><strong>Room Editing:</strong></p>
            <p>You can edit the title and description of this room. Note that you can only edit rooms that you created.</p>
          </div>
          {error && (
            <div className="error-message" style={{ color: '#ff4444', marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              Loading room data...
            </div>
          ) : (
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
                  {isSubmitting ? 'Updating Room...' : 'Update Room'}
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
          )}
        </div>
      </div>
    </div>
  );
};

export default EditRoomModal; 