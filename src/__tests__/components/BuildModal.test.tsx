import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BuildModal, { parseExits } from '../../components/BuildModal';
import { KeychainSDK } from 'keychain-sdk';

jest.mock('keychain-sdk', () => ({
  KeychainSDK: jest.fn(),
}));

const MockKeychainSDK = KeychainSDK as jest.Mock;

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  username: 'alice',
  currentRoom: { author: 'bob', permlink: 'starting-room' },
  onRoomCreated: jest.fn(),
  onBuildQueued: jest.fn(),
  onError: jest.fn(),
};

describe('BuildModal', () => {
  let mockPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPost = jest.fn().mockResolvedValue({ success: true });
    MockKeychainSDK.mockImplementation(() => ({ post: mockPost }));
  });

  it('renders nothing when closed', () => {
    const { container } = render(<BuildModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the form when open', () => {
    render(<BuildModal {...defaultProps} />);
    expect(screen.getByText('Create New Room')).toBeInTheDocument();
    expect(screen.getByLabelText(/room name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/room description/i)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button clicked', () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error when required fields are empty', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => {
      expect(screen.getByText(/please fill in all required fields/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('shows error when time-based interval is 0', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Forest' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A forest.' } });
    fireEvent.click(screen.getByLabelText(/enable time-based events/i));
    fireEvent.change(screen.getByLabelText(/interval blocks/i), { target: { name: 'intervalBlocks', value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => {
      expect(screen.getByText(/interval blocks must be greater than 0/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('shows time-based fields when checkbox is checked', () => {
    render(<BuildModal {...defaultProps} />);
    expect(screen.queryByLabelText(/interval blocks/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/enable time-based events/i));
    expect(screen.getByLabelText(/interval blocks/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start phase/i)).toBeInTheDocument();
  });

  describe('exit messages for the way back', () => {
    const fill = () => {
      fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Bell Loft' } });
      fireEvent.change(screen.getByLabelText(/exit from new room/i), { target: { name: 'exitFromNewRoom', value: 'down' } });
      fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'Dusty.' } });
    };

    it('saves them on the new room post, keyed by the exit back', async () => {
      render(<BuildModal {...defaultProps} />);
      fill();
      fireEvent.change(screen.getByLabelText('Message when leaving the new room through that exit'), { target: { value: ' You climb down the ladder. ' } });
      fireEvent.change(screen.getByLabelText('Message after arriving through that exit'), { target: { value: '%n drops into the room.' } });
      fireEvent.click(screen.getByRole('button', { name: /create room/i }));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      const meta = JSON.parse(mockPost.mock.calls[0][0].json_metadata);
      expect(meta.exitMessages).toEqual({ down: { leave: 'You climb down the ladder.', arrive: '%n drops into the room.' } });
      expect(meta.connection.exitFromNewRoom).toBe('down');
    });

    it('leaves them out when empty', async () => {
      render(<BuildModal {...defaultProps} />);
      fill();
      fireEvent.click(screen.getByRole('button', { name: /create room/i }));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(JSON.parse(mockPost.mock.calls[0][0].json_metadata)).not.toHaveProperty('exitMessages');
    });
  });

  it('calls onBuildQueued and onClose after successful submit', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Dark Forest' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A dark forest.' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(defaultProps.onBuildQueued).toHaveBeenCalled();
    });
  });

  it('shows error when keychain post returns failure', async () => {
    mockPost.mockResolvedValue({ success: false });
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Forest' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A forest.' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to create room/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('shows error when keychain throws', async () => {
    mockPost.mockRejectedValue(new Error('Timeout'));
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Forest' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A forest.' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => {
      expect(screen.getByText(/an error occurred while creating/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('resets form when modal reopens', async () => {
    const { rerender } = render(<BuildModal {...defaultProps} isOpen={false} />);
    rerender(<BuildModal {...defaultProps} isOpen={true} />);
    const roomNameInput = screen.getByLabelText(/room name/i) as HTMLInputElement;
    expect(roomNameInput.value).toBe('');
  });

  it('includes time-based event data in post payload when enabled', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Ferry Dock' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A dock.' } });
    fireEvent.click(screen.getByLabelText(/enable time-based events/i));
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
      const callArg = mockPost.mock.calls[0][0];
      const meta = JSON.parse(callArg.json_metadata);
      expect(meta.timeEvent).toBeDefined();
      expect(meta.timeEvent.type).toBe('ferry');
    });
  });

  it('updates text inputs on change', () => {
    render(<BuildModal {...defaultProps} />);
    const exitInput = screen.getByLabelText(/exit from current room/i);
    fireEvent.change(exitInput, { target: { name: 'exitToNewRoom', value: 'north' } });
    expect((exitInput as HTMLInputElement).value).toBe('north');
  });

  it('sends phases with their exits for time-based rooms', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Gondola' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A cable car.' } });
    fireEvent.click(screen.getByLabelText(/enable time-based events/i));
    fireEvent.change(screen.getByLabelText(/phase 0 name/i), { target: { value: 'At the top' } });
    fireEvent.change(screen.getByLabelText(/phase 0 exits/i), { target: { value: 'out: summit\nDown: valley ' } });
    fireEvent.change(screen.getByLabelText(/phase 1 name/i), { target: { value: 'Moving' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const meta = JSON.parse(mockPost.mock.calls[0][0].json_metadata);
    expect(meta.timeEvent.phases).toEqual([
      { phase: 0, name: 'At the top', description: '', exits: { out: 'summit', down: 'valley' } },
      { phase: 1, name: 'Moving', description: '', exits: {} },
    ]);
    expect(meta.timeEvent.startPhase).toBe(0);
  });

  it('lets builders add a third phase', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/enable time-based events/i));
    fireEvent.click(screen.getByRole('button', { name: /add phase/i }));
    expect(screen.getByLabelText(/phase 2 name/i)).toBeInTheDocument();
  });

  it('rejects malformed exit lines', async () => {
    render(<BuildModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Gondola' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A cable car.' } });
    fireEvent.click(screen.getByLabelText(/enable time-based events/i));
    fireEvent.change(screen.getByLabelText(/phase 1 exits/i), { target: { value: 'just-a-room' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    await waitFor(() => expect(screen.getByText(/phase 2: exit "just-a-room"/i)).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('parseExits handles blank lines and bad lines', () => {
    expect(parseExits('north: a\n\n south :b ')).toEqual({ exits: { north: 'a', south: 'b' } });
    expect(parseExits('north:').error).toMatch(/north:/);
  });
});
