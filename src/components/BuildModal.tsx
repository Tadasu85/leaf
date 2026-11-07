import React, { useState, useEffect } from 'react';
import { buildExitMessages, MAX_EXIT_MESSAGE_LENGTH } from '../game/rooms/exitMessages';
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
  onError?: (error: string) => void; // Add error callback prop
}

interface RoomFormData {
  roomName: string;
  exitToNewRoom: string;
  exitFromNewRoom: string;
  description: string;
  isTimeBased: boolean;
  intervalBlocks: number;
  startPhase: number;
}

interface PhaseFormData {
  name: string;
  description: string;
  exits: string; // one "direction: room-permlink" per line
}

const defaultPhases = (): PhaseFormData[] => [
  { name: 'Phase 1', description: '', exits: '' },
  { name: 'Phase 2', description: '', exits: '' }
];

/** Parses "north: some-room" lines into an exits map. Returns an error message for bad lines. */
export const parseExits = (text: string): { exits: Record<string, string>; error?: string } => {
  const exits: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    const direction = idx === -1 ? '' : line.slice(0, idx).trim().toLowerCase();
    const target = idx === -1 ? '' : line.slice(idx + 1).trim();
    if (!direction || !target) {
      return { exits, error: `Exit "${line}" should look like "north: room-permlink"` };
    }
    exits[direction] = target;
  }
  return { exits };
};

const BuildModal: React.FC<BuildModalProps> = ({ isOpen, onClose, username, currentRoom, onRoomCreated, onBuildQueued, onError }) => {
  const [formData, setFormData] = useState<RoomFormData>({
    roomName: '',
    exitToNewRoom: '',
    exitFromNewRoom: '',
    description: '',
    isTimeBased: false,
    intervalBlocks: 100,
    startPhase: 0
  });
  const [phases, setPhases] = useState<PhaseFormData[]>(defaultPhases());
  // Optional exit messages for the new room's exit back (the builder owns the new room)
  const emptyBackExit = { leave: '', arrive: '', othersLeave: '', othersArrive: '' };
  const [backExitMessage, setBackExitMessage] = useState<{ leave: string; arrive: string; othersLeave: string; othersArrive: string }>(emptyBackExit);
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

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseInt(value) || 0
    }));
  };

  const updatePhase = (index: number, field: keyof PhaseFormData, value: string) => {
    setPhases(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addPhase = () => {
    setPhases(prev => [...prev, { name: `Phase ${prev.length + 1}`, description: '', exits: '' }]);
  };

  const removePhase = (index: number) => {
    setPhases(prev => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
    setFormData(prev => ({ ...prev, startPhase: Math.min(prev.startPhase, Math.max(phases.length - 2, 0)) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.roomName.trim() || !formData.description.trim()) {
      const errorMsg = 'Please fill in all required fields';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    if (formData.isTimeBased && formData.intervalBlocks <= 0) {
      const errorMsg = 'Interval blocks must be greater than 0';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    // Build the phase list for time-based rooms. Without phases the room can
    // never change state, so they are required.
    let builtPhases: { phase: number; name: string; description: string; exits: Record<string, string> }[] = [];
    if (formData.isTimeBased) {
      const fail = (msg: string) => {
        setError(msg);
        if (onError) onError(msg);
      };
      if (phases.length < 2) return fail('Time-based rooms need at least 2 phases');
      if (formData.startPhase < 0 || formData.startPhase >= phases.length) {
        return fail(`Start phase must be between 0 and ${phases.length - 1}`);
      }
      for (let i = 0; i < phases.length; i++) {
        const p = phases[i]!;
        if (!p.name.trim()) return fail(`Phase ${i + 1} needs a name`);
        const { exits, error: exitError } = parseExits(p.exits);
        if (exitError) return fail(`Phase ${i + 1}: ${exitError}`);
        builtPhases.push({ phase: i, name: p.name.trim(), description: p.description.trim(), exits });
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Generate permlink from room name
      const permlink = generatePermlink(formData.roomName.trim());
      
      // Validate permlink
      if (!permlink) {
        const errorMsg = 'Room name must contain valid characters';
        setError(errorMsg);
        if (onError) onError(errorMsg);
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
          ...(() => {
            const direction = formData.exitFromNewRoom.trim();
            const exitMessages = buildExitMessages([direction], { [direction]: backExitMessage });
            return Object.keys(exitMessages).length ? { exitMessages } : {};
          })(),
          connection: {
            fromRoom: currentRoom ? {
              author: currentRoom.author,
              permlink: currentRoom.permlink
            } : null,
            exitToNewRoom: formData.exitToNewRoom,
            exitFromNewRoom: formData.exitFromNewRoom
          },
          // Add time-based event configuration if enabled
          ...(formData.isTimeBased && {
            timeEvent: {
              type: 'ferry',
              intervalBlocks: formData.intervalBlocks,
              startPhase: formData.startPhase,
              phases: builtPhases
            }
          })
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
          description: '',
          isTimeBased: false,
          intervalBlocks: 100,
          startPhase: 0
        });
        setPhases(defaultPhases());
        setBackExitMessage(emptyBackExit);
        if (onBuildQueued) {
          onBuildQueued();
        }
      } else {
        const errorMsg = 'Failed to create room. Please try again.';
        setError(errorMsg);
        if (onError) onError(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'An error occurred while creating the room.';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        roomName: '',
        exitToNewRoom: '',
        exitFromNewRoom: '',
        description: '',
        isTimeBased: false,
        intervalBlocks: 100,
        startPhase: 0
      });
      setPhases(defaultPhases());
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal__overlay">
      <div className="modal__content">
        <div className="modal__header">
          <h2>Create New Room</h2>
          <button className="modal__close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body">
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <p><strong>Room Connection:</strong></p>
            <p>Specify how this new room connects to your current location. The exits will be configured automatically when the room is approved.</p>
          </div>
          {error && (
                    <div className="modal__error-message">
          {error}
        </div>
          )}
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
              <label className="modal__form-label" htmlFor="exitToNewRoom">Exit from Current Room:</label>
              <input
                className="modal__form-input"
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

            <div className="modal__form-group">
              <label className="modal__form-label" htmlFor="exitFromNewRoom">Exit from New Room:</label>
              <input
                className="modal__form-input"
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

            <div className="modal__form-group">
              <span className="modal__form-label">Messages for that exit (optional):</span>
              <input
                className="modal__form-input"
                type="text"
                aria-label="Message when leaving the new room through that exit"
                placeholder="When leaving, e.g. You squeeze back through the gap."
                value={backExitMessage.leave}
                maxLength={MAX_EXIT_MESSAGE_LENGTH}
                onChange={e => setBackExitMessage(prev => ({ ...prev, leave: e.target.value }))}
                disabled={isSubmitting}
              />
              <input
                className="modal__form-input"
                type="text"
                aria-label="Message after arriving through that exit"
                placeholder="After arriving. %n becomes the player's name."
                value={backExitMessage.arrive}
                maxLength={MAX_EXIT_MESSAGE_LENGTH}
                onChange={e => setBackExitMessage(prev => ({ ...prev, arrive: e.target.value }))}
                disabled={isSubmitting}
              />
              <input
                className="modal__form-input"
                type="text"
                aria-label="What others in the new room see when someone leaves through that exit"
                placeholder="Others in the new room see, e.g. %n squeezes out through the gap."
                value={backExitMessage.othersLeave}
                maxLength={MAX_EXIT_MESSAGE_LENGTH}
                onChange={e => setBackExitMessage(prev => ({ ...prev, othersLeave: e.target.value }))}
                disabled={isSubmitting}
              />
              <input
                className="modal__form-input"
                type="text"
                aria-label="What others in your current room see when someone comes back through that exit"
                placeholder="Others back here see, e.g. %n squeezes back in through the gap."
                value={backExitMessage.othersArrive}
                maxLength={MAX_EXIT_MESSAGE_LENGTH}
                onChange={e => setBackExitMessage(prev => ({ ...prev, othersArrive: e.target.value }))}
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

            {/* Time-based Event Toggle */}
            <div className="modal__form-group">
              <label className="modal__form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="isTimeBased"
                  name="isTimeBased"
                  checked={formData.isTimeBased}
                  onChange={handleCheckboxChange}
                  disabled={isSubmitting}
                />
                <span>Enable Time-based Events (Ferry Room)</span>
              </label>
            </div>

            {/* Time-based Event Options */}
            {formData.isTimeBased && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '1rem', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '4px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#495057' }}>⏰ Time-based Event Configuration</h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#6c757d' }}>
                  This room will change its exits based on blockchain time. Each Hive block represents ~3 seconds of real time.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="modal__form-group">
                    <label className="modal__form-label" htmlFor="intervalBlocks">Interval Blocks:</label>
                    <input
                      className="modal__form-input"
                      type="number"
                      id="intervalBlocks"
                      name="intervalBlocks"
                      value={formData.intervalBlocks}
                      onChange={handleNumberChange}
                      min="1"
                      placeholder="100"
                      disabled={isSubmitting}
                    />
                    <small style={{ color: '#6c757d', fontSize: '0.8rem' }}>
                      Blocks between state changes (~{Math.round(formData.intervalBlocks * 3 / 60)} minutes)
                    </small>
                  </div>

                  <div className="modal__form-group">
                    <label className="modal__form-label" htmlFor="startPhase">Start Phase:</label>
                    <input
                      className="modal__form-input"
                      type="number"
                      id="startPhase"
                      name="startPhase"
                      value={formData.startPhase}
                      onChange={handleNumberChange}
                      min="0"
                      max={phases.length - 1}
                      placeholder="0"
                      disabled={isSubmitting}
                    />
                    <small style={{ color: '#6c757d', fontSize: '0.8rem' }}>
                      Phase the room is in when approved (0 = first phase)
                    </small>
                  </div>
                </div>

                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  backgroundColor: '#e3f2fd', 
                  borderRadius: '4px',
                  fontSize: '0.85rem'
                }}>
                  The room cycles through these phases in order, then repeats. Each phase replaces the room's
                  exits. Write exits one per line, like <code>north: room-permlink</code>. Leave them empty for a
                  phase with no way out.
                </div>

                {phases.map((phase, i) => (
                  <fieldset
                    key={i}
                    style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #dee2e6', borderRadius: '4px' }}
                  >
                    <legend style={{ fontSize: '0.9rem', padding: '0 0.25rem' }}>Phase {i}</legend>
                    <div className="modal__form-group">
                      <label className="modal__form-label" htmlFor={`phase-${i}-name`}>Phase {i} name:</label>
                      <input
                        className="modal__form-input"
                        id={`phase-${i}-name`}
                        value={phase.name}
                        onChange={e => updatePhase(i, 'name', e.target.value)}
                        maxLength={100}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="modal__form-group">
                      <label className="modal__form-label" htmlFor={`phase-${i}-description`}>Phase {i} description:</label>
                      <textarea
                        className="modal__form-textarea"
                        id={`phase-${i}-description`}
                        value={phase.description}
                        onChange={e => updatePhase(i, 'description', e.target.value)}
                        rows={2}
                        maxLength={500}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="modal__form-group">
                      <label className="modal__form-label" htmlFor={`phase-${i}-exits`}>Phase {i} exits:</label>
                      <textarea
                        className="modal__form-textarea"
                        id={`phase-${i}-exits`}
                        value={phase.exits}
                        onChange={e => updatePhase(i, 'exits', e.target.value)}
                        rows={2}
                        placeholder="north: room-permlink"
                        disabled={isSubmitting}
                      />
                    </div>
                    {phases.length > 2 && (
                      <button
                        type="button"
                        className="modal__cancel-button"
                        onClick={() => removePhase(i)}
                        disabled={isSubmitting}
                      >
                        Remove phase {i}
                      </button>
                    )}
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="modal__cancel-button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={addPhase}
                  disabled={isSubmitting}
                >
                  Add phase
                </button>
              </div>
            )}

            <div className="modal__form-actions">
              <button 
                type="submit" 
                className="modal__submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating Room...' : 'Create Room'}
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
        </div>
      </div>
    </div>
  );
};

export default BuildModal; 