import React, { useState, useEffect } from 'react';
import { useGameContext } from '../contexts/GameContext';
import logger from '../utils/Logger';

interface TimeEventManagerProps {
  isVisible: boolean;
  onClose: () => void;
}

const TimeEventManager: React.FC<TimeEventManagerProps> = ({ isVisible, onClose }) => {
  const { gameState } = useGameContext();
  const [ferryRooms, setFerryRooms] = useState<string[]>([]);
  const [newFerryConfig, setNewFerryConfig] = useState({
    roomPermlink: '',
    title: '',
    description: '',
    intervalBlocks: 100,
    startPhase: 0
  });

  useEffect(() => {
    if (gameState) {
      // Initialize with some example ferry rooms
      const exampleFerryRooms = [
        'ferry-port-a',
        'ferry-port-b',
        'ferry-interior'
      ];
      
      exampleFerryRooms.forEach(permlink => {
        gameState.createFerryRoom(
          permlink,
          `Ferry ${permlink}`,
          `A ferry that travels between ports.`,
          100,
          0
        );
      });
      
      setFerryRooms(exampleFerryRooms);
    }
  }, [gameState]);

  const handleCreateFerry = () => {
    if (!gameState || !newFerryConfig.roomPermlink) return;

    try {
      gameState.createFerryRoom(
        newFerryConfig.roomPermlink,
        newFerryConfig.title,
        newFerryConfig.description,
        newFerryConfig.intervalBlocks,
        newFerryConfig.startPhase
      );

      setFerryRooms(prev => [...prev, newFerryConfig.roomPermlink]);
      setNewFerryConfig({
        roomPermlink: '',
        title: '',
        description: '',
        intervalBlocks: 100,
        startPhase: 0
      });

      logger.debug(`Created ferry room: ${newFerryConfig.roomPermlink}`);
    } catch (error) {
      logger.error('Error creating ferry room:', error);
    }
  };

  const handleRemoveFerry = (permlink: string) => {
    if (!gameState) return;

    try {
      gameState.unregisterTimeEventRoom(permlink);
      setFerryRooms(prev => prev.filter(room => room !== permlink));
      logger.debug(`Removed ferry room: ${permlink}`);
    } catch (error) {
      logger.error('Error removing ferry room:', error);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Time Event Manager</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="time-event-info-box">
            <p><strong>Blockchain Time Events:</strong></p>
            <p>Create ferry rooms that change their exits based on blockchain time. Each Hive block represents ~3 seconds of real time.</p>
          </div>

          {/* Create New Ferry */}
          <div className="time-event-section">
            <h3>Create New Ferry</h3>
            <div className="time-event-grid">
              <div className="modal-form-group">
                <label className="modal-form-label">Room Permlink:</label>
                <input
                  className="modal-form-input"
                  type="text"
                  placeholder="Room Permlink"
                  value={newFerryConfig.roomPermlink}
                  onChange={(e) => setNewFerryConfig(prev => ({
                    ...prev,
                    roomPermlink: e.target.value
                  }))}
                />
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label">Title:</label>
                <input
                  className="modal-form-input"
                  type="text"
                  placeholder="Title"
                  value={newFerryConfig.title}
                  onChange={(e) => setNewFerryConfig(prev => ({
                    ...prev,
                    title: e.target.value
                  }))}
                />
              </div>
            </div>
            <div className="modal-form-group">
              <label className="modal-form-label">Description:</label>
              <textarea
                className="modal-form-textarea"
                placeholder="Description"
                value={newFerryConfig.description}
                onChange={(e) => setNewFerryConfig(prev => ({
                  ...prev,
                  description: e.target.value
                }))}
                rows={3}
              />
            </div>
            <div className="time-event-grid">
              <div className="modal-form-group">
                <label className="modal-form-label">Interval Blocks:</label>
                <input
                  className="modal-form-input"
                  type="number"
                  placeholder="100"
                  value={newFerryConfig.intervalBlocks}
                  onChange={(e) => setNewFerryConfig(prev => ({
                    ...prev,
                    intervalBlocks: parseInt(e.target.value) || 100
                  }))}
                />
              </div>
              <div className="modal-form-group">
                <label className="modal-form-label">Start Phase:</label>
                <input
                  className="modal-form-input"
                  type="number"
                  placeholder="0"
                  value={newFerryConfig.startPhase}
                  onChange={(e) => setNewFerryConfig(prev => ({
                    ...prev,
                    startPhase: parseInt(e.target.value) || 0
                  }))}
                />
              </div>
            </div>
            <button
              onClick={handleCreateFerry}
              className="submit-button"
            >
              Create Ferry
            </button>
          </div>

          {/* Existing Ferry Rooms */}
          <div className="time-event-section">
            <h3>Active Ferry Rooms</h3>
            {ferryRooms.length === 0 ? (
              <p className="time-event-empty-state">No ferry rooms created yet.</p>
            ) : (
              <div className="time-event-rooms-list">
                {ferryRooms.map(permlink => (
                  <div key={permlink} className="time-event-room-item">
                    <span className="time-event-room-permlink">{permlink}</span>
                    <button
                      onClick={() => handleRemoveFerry(permlink)}
                      className="time-event-remove-btn"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Information */}
          <div className="time-event-info-section">
            <h3>How It Works</h3>
            <p>
              Ferry rooms use the blockchain as a heartbeat mechanism. Each block on the Hive blockchain 
              represents approximately 3 seconds of real time. The ferry will change its state and exits 
              based on the configured interval.
            </p>
            <p>
              <strong>Phases:</strong> Docked at Port A → Departing → At Sea → Arriving at Port B → 
              Docked at Port B → Departing → (cycle repeats)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeEventManager; 