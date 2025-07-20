import React, { useState, useEffect } from 'react';
import { HiveClient } from '../game/blockchain/HiveClient';
import config from '../config';
import logger from '../utils/Logger';

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
    roomName: currentRoom?.title || '',
    description: currentRoom?.description || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hiveClient = new HiveClient();

  // Update form data when currentRoom changes
  useEffect(() => {
    if (currentRoom) {
      setFormData({
        roomName: currentRoom.title,
        description: currentRoom.description
      });
    }
  }, [currentRoom]);

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
      // Use HiveClient to update the post (works even after payout)
      const jsonMetadata = {
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
      };

      // Submit the update using HiveClient
      await hiveClient.updatePost(
        username,
        currentRoom.permlink,
        formData.roomName.trim(),
        formData.description.trim(),
        jsonMetadata
      );
      
      // If we get here, the update was successful
      onClose();
      // Reset form
      setFormData({
        roomName: '',
        description: ''
      });
      if (onRoomUpdated) {
        onRoomUpdated();
      }
    } catch (error) {
      logger.error('Error updating room:', error);
      setError('An error occurred while updating the room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal__overlay">
      <div className="modal__content">
        <div className="modal__header">
          <h2>Edit Room</h2>
          <button className="modal__close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body">
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <p><strong>Room Editing:</strong></p>
            <p>You can edit the title and description of this room. Note that you can only edit rooms that you created.</p>
          </div>
          {error && (
            <div className="modal__error-message">
              {error}
            </div>
          )}
          {isSubmitting ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              Updating Room...
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="modal__form-group">
                <label className="modal__form-label" htmlFor="roomName">Room Name:</label>
                <input
                  className="modal__form-input"
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

              <div className="modal__form-group">
                <label className="modal__form-label" htmlFor="description">Room Description:</label>
                <textarea
                  className="modal__form-textarea"
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

              <div className="modal__form-actions">
                <button 
                  type="submit" 
                  className="modal__submit-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating Room...' : 'Update Room'}
                </button>
                <button 
                  type="button" 
                  className="modal__cancel-button" 
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