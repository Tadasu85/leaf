import React, { useState, useEffect } from 'react';
import { HiveClient } from '../game/blockchain/HiveClient';
import { parseRoomObjects, objectsToText, textToObjects } from '../game/rooms/roomObjects';
import config from '../config';
import logger from '../utils/Logger';
import { ExitMessage } from '../game/types/GameTypes';
import { buildExitMessages, MAX_EXIT_MESSAGE_LENGTH } from '../game/rooms/exitMessages';

interface EditRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  currentRoom: {
    author: string;
    permlink: string;
    title: string;
    description: string;
    /** Exit directions of the room, for the exit-message fields */
    exits?: string[];
    exitMessages?: Record<string, ExitMessage>;
  } | null;
  onRoomUpdated?: () => void;
  onError?: (error: string) => void; // Add error callback prop
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
  onRoomUpdated,
  onError 
}) => {
  const [formData, setFormData] = useState<RoomFormData>({
    roomName: currentRoom?.title || '',
    description: currentRoom?.description || ''
  });
  const [exitMessages, setExitMessages] = useState<Record<string, ExitMessage>>(currentRoom?.exitMessages || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hiveClient = new HiveClient();

  // Things people can do here ("ring bell: ..."), read from the room post when the form opens.
  // Only saved if they loaded, so a failed read never wipes them.
  const [objectsText, setObjectsText] = useState('');
  const [objectsLoaded, setObjectsLoaded] = useState(false);
  useEffect(() => {
    if (!isOpen || !currentRoom) return;
    let cancelled = false;
    setObjectsLoaded(false);
    Promise.resolve()
      .then(() => hiveClient.database?.call('get_content', [currentRoom.author, currentRoom.permlink]))
      .then((content: any) => {
        if (cancelled || !content) return;
        setObjectsText(objectsToText(parseRoomObjects(content.json_metadata)));
        setObjectsLoaded(true);
      })
      .catch(() => { /* leave the field read-only below */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentRoom?.author, currentRoom?.permlink]);

  // Update form data when currentRoom changes
  useEffect(() => {
    if (currentRoom) {
      setFormData({
        roomName: currentRoom.title,
        description: currentRoom.description
      });
      setExitMessages(currentRoom.exitMessages || {});
    }
  }, [currentRoom]);

  const handleExitMessageChange = (direction: string, field: keyof ExitMessage, value: string) => {
    setExitMessages(prev => ({
      ...prev,
      [direction]: { ...prev[direction], [field]: value }
    }));
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
    
    if (!username || !currentRoom) {
      const errorMsg = 'You must be logged in and in a room to edit it.';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    if (!formData.roomName.trim() || !formData.description.trim()) {
      const errorMsg = 'Please fill in all required fields';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    // Check if user is the author of the room
    if (username !== currentRoom.author) {
      const errorMsg = 'You can only edit rooms that you created.';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    const parsedObjects = objectsLoaded ? textToObjects(objectsText) : null;
    if (parsedObjects?.error) {
      setError(parsedObjects.error);
      if (onError) onError(parsedObjects.error);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Use HiveClient to update the post (works even after payout)
      const jsonMetadata = {
        app: config.game.idName,
        type: 'room',
        format: 'markdown',
        tags: ['ego-death'],
        // Sent whole: an emptied field removes that message.
        exitMessages: buildExitMessages(currentRoom.exits || [], exitMessages)
        // connection and timeEvent are left out on purpose: updatePost merges
        // this over the post's existing metadata, so they are preserved.
      };

      // Submit the update using HiveClient
      await hiveClient.updatePost(
        username,
        currentRoom.permlink,
        formData.roomName.trim(),
        formData.description.trim(),
        parsedObjects ? { ...jsonMetadata, objects: parsedObjects.objects } : jsonMetadata
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
      const errorMsg = error instanceof Error ? error.message : 'An error occurred while updating the room.';
      setError(errorMsg);
      if (onError) onError(errorMsg);
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
            <p>You can edit the title, description and exit messages of this room. Note that you can only edit rooms that you created.</p>
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
                <label className="modal__form-label" htmlFor="roomObjects">Things people can do here (optional):</label>
                <textarea
                  className="modal__form-textarea"
                  id="roomObjects"
                  value={objectsText}
                  onChange={e => setObjectsText(e.target.value)}
                  placeholder={'One per line, e.g.\nring bell: You ring the bell. | %n rings the bell.'}
                  rows={3}
                  disabled={isSubmitting || !objectsLoaded}
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

              {(currentRoom?.exits?.length ?? 0) > 0 && (
                <fieldset className="modal__form-group">
                  <legend className="modal__form-label">Exit messages (optional)</legend>
                  <p style={{ marginTop: 0 }}>
                    Lines shown when someone uses an exit: to them, and to the other players in each room. <code>%n</code> becomes their name.
                    For example: "You climb the narrow ladder."
                  </p>
                  {currentRoom!.exits!.map(direction => (
                    <div key={direction} style={{ marginBottom: '0.75rem' }}>
                      <strong>{direction}</strong>
                      <input
                        className="modal__form-input"
                        type="text"
                        aria-label={`Message when leaving ${direction}`}
                        placeholder={`When leaving ${direction}`}
                        value={exitMessages[direction]?.leave ?? ''}
                        maxLength={MAX_EXIT_MESSAGE_LENGTH}
                        onChange={e => handleExitMessageChange(direction, 'leave', e.target.value)}
                        disabled={isSubmitting}
                      />
                      <input
                        className="modal__form-input"
                        type="text"
                        aria-label={`Message after arriving through ${direction}`}
                        placeholder={`After arriving through ${direction}`}
                        value={exitMessages[direction]?.arrive ?? ''}
                        maxLength={MAX_EXIT_MESSAGE_LENGTH}
                        onChange={e => handleExitMessageChange(direction, 'arrive', e.target.value)}
                        disabled={isSubmitting}
                      />
                      <input
                        className="modal__form-input"
                        type="text"
                        aria-label={`What others here see when someone leaves ${direction}`}
                        placeholder={`Others here see, e.g. %n climbs the ladder.`}
                        value={exitMessages[direction]?.othersLeave ?? ''}
                        maxLength={MAX_EXIT_MESSAGE_LENGTH}
                        onChange={e => handleExitMessageChange(direction, 'othersLeave', e.target.value)}
                        disabled={isSubmitting}
                      />
                      <input
                        className="modal__form-input"
                        type="text"
                        aria-label={`What others in the next room see when someone arrives through ${direction}`}
                        placeholder={`Others in the next room see, e.g. %n climbs up from below.`}
                        value={exitMessages[direction]?.othersArrive ?? ''}
                        maxLength={MAX_EXIT_MESSAGE_LENGTH}
                        onChange={e => handleExitMessageChange(direction, 'othersArrive', e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  ))}
                </fieldset>
              )}

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