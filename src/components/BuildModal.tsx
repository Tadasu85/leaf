import React, { useState } from 'react';

interface BuildModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RoomFormData {
  roomName: string;
  exitToNewRoom: string;
  exitFromNewRoom: string;
  description: string;
}

const BuildModal: React.FC<BuildModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState<RoomFormData>({
    roomName: '',
    exitToNewRoom: '',
    exitFromNewRoom: '',
    description: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Handle form submission
    console.log('Form submitted:', formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Build New Room</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
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
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-button">Create Room</button>
              <button type="button" className="cancel-button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BuildModal; 