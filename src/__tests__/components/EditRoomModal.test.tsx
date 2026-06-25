import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditRoomModal from '../../components/EditRoomModal';
import { HiveClient } from '../../game/blockchain/HiveClient';

jest.mock('../../game/blockchain/HiveClient', () => ({
  HiveClient: jest.fn(),
}));

const MockHiveClient = HiveClient as jest.Mock;

const currentRoom = {
  author: 'alice',
  permlink: 'my-room',
  title: 'My Room',
  description: 'A cozy room.',
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  username: 'alice',
  currentRoom,
  onRoomUpdated: jest.fn(),
  onError: jest.fn(),
};

describe('EditRoomModal', () => {
  let mockUpdatePost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePost = jest.fn().mockResolvedValue(undefined);
    MockHiveClient.mockImplementation(() => ({ updatePost: mockUpdatePost }));
  });

  it('renders nothing when closed', () => {
    const { container } = render(<EditRoomModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the form with pre-filled values when open', () => {
    render(<EditRoomModal {...defaultProps} />);
    expect(screen.getByText('Edit Room')).toBeInTheDocument();
    expect((screen.getByLabelText(/room name/i) as HTMLInputElement).value).toBe('My Room');
    expect((screen.getByLabelText(/room description/i) as HTMLTextAreaElement).value).toBe('A cozy room.');
  });

  it('updates form when currentRoom prop changes', () => {
    const { rerender } = render(<EditRoomModal {...defaultProps} />);
    rerender(<EditRoomModal {...defaultProps} currentRoom={{ ...currentRoom, title: 'Updated Room', description: 'A new description.' }} />);
    expect((screen.getByLabelText(/room name/i) as HTMLInputElement).value).toBe('Updated Room');
    expect((screen.getByLabelText(/room description/i) as HTMLTextAreaElement).value).toBe('A new description.');
  });

  it('calls onClose when close button clicked', () => {
    render(<EditRoomModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button clicked', () => {
    render(<EditRoomModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error when username is null', async () => {
    render(<EditRoomModal {...defaultProps} username={null} />);
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(screen.getByText(/must be logged in/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('shows error when currentRoom is null', async () => {
    render(<EditRoomModal {...defaultProps} currentRoom={null} />);
    // form is hidden (only shown when !isSubmitting and isOpen), submit button rendered
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update room/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(screen.getByText(/must be logged in/i)).toBeInTheDocument();
    });
  });

  it('shows error when fields are empty', async () => {
    render(<EditRoomModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: '' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(screen.getByText(/please fill in all required fields/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('shows error when user is not the room author', async () => {
    render(<EditRoomModal {...defaultProps} username="bob" />);
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(screen.getByText('You can only edit rooms that you created.')).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalled();
    });
  });

  it('calls updatePost, onRoomUpdated, and onClose on successful submit', async () => {
    render(<EditRoomModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { name: 'roomName', value: 'Updated Room' } });
    fireEvent.change(screen.getByLabelText(/room description/i), { target: { name: 'description', value: 'A better description.' } });
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(mockUpdatePost).toHaveBeenCalledWith(
        'alice',
        'my-room',
        'Updated Room',
        'A better description.',
        expect.any(Object)
      );
      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(defaultProps.onRoomUpdated).toHaveBeenCalled();
    });
  });

  it('shows error and calls onError when updatePost throws', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Broadcast failed'));
    render(<EditRoomModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(screen.getByText(/broadcast failed/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalledWith('Broadcast failed');
    });
  });

  it('shows generic error when updatePost throws non-Error', async () => {
    mockUpdatePost.mockRejectedValue('something went wrong');
    render(<EditRoomModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /update room/i }));
    await waitFor(() => {
      expect(screen.getByText(/an error occurred while updating/i)).toBeInTheDocument();
    });
  });

  it('updates inputs on change', () => {
    render(<EditRoomModal {...defaultProps} />);
    const nameInput = screen.getByLabelText(/room name/i);
    fireEvent.change(nameInput, { target: { name: 'roomName', value: 'New Name' } });
    expect((nameInput as HTMLInputElement).value).toBe('New Name');
  });
});
