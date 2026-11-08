import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditRoomModal from '../../components/EditRoomModal';
import { HiveClient } from '../../game/blockchain/HiveClient';

jest.mock('../../game/blockchain/HiveClient', () => ({
  HiveClient: jest.fn(),
}));

const MockHiveClient = HiveClient as unknown as jest.Mock;

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

  describe('things people can do here', () => {
    const withPost = (json_metadata: string | Promise<never>) => {
      const call = typeof json_metadata === 'string' ? jest.fn().mockResolvedValue({ json_metadata }) : jest.fn().mockReturnValue(json_metadata);
      MockHiveClient.mockImplementation(() => ({ updatePost: mockUpdatePost, database: { call } }));
    };

    it("loads the room's objects into the field and saves edits", async () => {
      withPost(JSON.stringify({ objects: { bell: { ring: { self: 'You ring it.' } } } }));
      render(<EditRoomModal {...defaultProps} />);
      const field = await screen.findByDisplayValue('ring bell: You ring it.');
      fireEvent.change(field, { target: { value: 'ring bell: You ring it. | %n rings it.' } });
      fireEvent.click(screen.getByRole('button', { name: /update room/i }));
      await waitFor(() => expect(mockUpdatePost).toHaveBeenCalled());
      expect(mockUpdatePost.mock.calls[0][4].objects).toEqual({ bell: { ring: { self: 'You ring it.', others: '%n rings it.' } } });
    });

    it('refuses a badly written line', async () => {
      withPost('{}');
      render(<EditRoomModal {...defaultProps} />);
      const field = screen.getByLabelText(/things people can do here/i);
      await waitFor(() => expect(field).not.toBeDisabled());
      fireEvent.change(field, { target: { value: 'ring the bell' } });
      fireEvent.click(screen.getByRole('button', { name: /update room/i }));
      expect(await screen.findByText(/Line 1: write it like/)).toBeInTheDocument();
      expect(mockUpdatePost).not.toHaveBeenCalled();
    });

    it("doesn't touch objects if they couldn't be loaded", async () => {
      withPost(Promise.reject(new Error('offline')) as Promise<never>);
      render(<EditRoomModal {...defaultProps} />);
      expect(screen.getByLabelText(/things people can do here/i)).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: /update room/i }));
      await waitFor(() => expect(mockUpdatePost).toHaveBeenCalled());
      expect(mockUpdatePost.mock.calls[0][4]).not.toHaveProperty('objects');
    });
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
  describe('exit messages', () => {
    const roomWithExits = {
      ...currentRoom,
      exits: ['north', 'down'],
      exitMessages: { north: { leave: 'You climb the ladder.' } },
    };

    it('shows a leave and arrive field per exit, pre-filled', () => {
      render(<EditRoomModal {...defaultProps} currentRoom={roomWithExits} />);
      expect((screen.getByLabelText('Message when leaving north') as HTMLInputElement).value).toBe('You climb the ladder.');
      expect((screen.getByLabelText('Message after arriving through down') as HTMLInputElement).value).toBe('');
    });

    it('has no exit section for a room without exits', () => {
      render(<EditRoomModal {...defaultProps} />);
      expect(screen.queryByText('Exit messages (optional)')).not.toBeInTheDocument();
    });

    it('saves exit messages in the post metadata, dropping empty ones', async () => {
      render(<EditRoomModal {...defaultProps} currentRoom={roomWithExits} />);
      fireEvent.change(screen.getByLabelText('Message after arriving through down'), { target: { value: '  %n lands softly.  ' } });
      fireEvent.change(screen.getByLabelText('What others here see when someone leaves down'), { target: { value: '%n drops through the hatch.' } });
      fireEvent.change(screen.getByLabelText('Message when leaving north'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /update room/i }));
      await waitFor(() => expect(mockUpdatePost).toHaveBeenCalled());
      const metadata = mockUpdatePost.mock.calls[0][4];
      expect(metadata.exitMessages).toEqual({ down: { arrive: '%n lands softly.', othersLeave: '%n drops through the hatch.' } });
      expect(metadata).not.toHaveProperty('connection');
      expect(metadata).not.toHaveProperty('timeEvent');
    });
  });
});
