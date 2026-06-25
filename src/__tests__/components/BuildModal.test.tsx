import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BuildModal from '../../components/BuildModal';
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
});
