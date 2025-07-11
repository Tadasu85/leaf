import React, { useState } from 'react';
import { KeychainSDK } from 'keychain-sdk';
import config from '../config';

interface AddDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  currentRoom: {
    author: string;
    permlink: string;
  } | null;
  onDetailAdded?: () => void;
}

const AddDetailModal: React.FC<AddDetailModalProps> = ({
  isOpen,
  onClose,
  username,
  currentRoom,
  onDetailAdded
}) => {
  const [formData, setFormData] = useState({
    detailName: '',
    detailDescription: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keychain = new KeychainSDK(window, { rpc: config.hive.nodes[0] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !currentRoom) {
      setError('You must be logged in and in a room to add details.');
      return;
    }

    if (!formData.detailName.trim() || !formData.detailDescription.trim()) {
      setError('Please provide both a detail name and description.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Generate a unique permlink for the comment
      const timestamp = Date.now();
      const permlink = `detail-${timestamp}`;

      // Create the comment data
      const commentData = {
        username: username,
        body: `${formData.detailName.trim()}: ${formData.detailDescription.trim()}`,
        permlink,
        parent_author: currentRoom.author,
        parent_perm: currentRoom.permlink,
        parent_username: currentRoom.author,
        json_metadata: JSON.stringify({
          app: 'leaf',
          format: 'markdown',
          tags: ['leaf-detail']
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

      // Submit the comment
      const commentResult = await keychain.post(commentData);
      
      console.log('Keychain post result:', commentResult);
      
      if (commentResult.success) {
        onClose();
        // Reset form
        setFormData({
          detailName: '',
          detailDescription: ''
        });
        if (onDetailAdded) {
          onDetailAdded();
        }
      } else {
        console.error('Keychain post failed:', commentResult);
        setError(`Failed to add detail: ${commentResult.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding detail:', err);
      if (err instanceof Error) {
        setError(`Error: ${err.message}`);
      } else {
        setError('An error occurred while adding the detail.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Add Room Detail</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="detailName">
                Detail Name:
              </label>
              <input
                type="text"
                id="detailName"
                name="detailName"
                className="modal-form-input"
                value={formData.detailName}
                onChange={handleInputChange}
                placeholder="e.g., Ancient Book, Mysterious Door"
                maxLength={50}
                required
              />
            </div>
            
            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="detailDescription">
                Detail Description:
              </label>
              <textarea
                id="detailDescription"
                name="detailDescription"
                className="modal-form-textarea"
                value={formData.detailDescription}
                onChange={handleInputChange}
                placeholder="Describe what players see when they look at this detail..."
                rows={4}
                maxLength={500}
                required
              />
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add Detail'}
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

export default AddDetailModal; 