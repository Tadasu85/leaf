import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QueueManagementModal from '../../components/QueueManagementModal';
import { KeychainSDK } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';

jest.mock('keychain-sdk', () => ({
  KeychainSDK: jest.fn(),
  KeychainKeyTypes: { posting: 'posting' },
  Broadcast: {},
}));

jest.mock('@hiveio/dhive', () => ({
  Client: jest.fn(),
}));

const MockKeychainSDK = KeychainSDK as jest.Mock;
const MockDhiveClient = Client as jest.Mock;

const GAME_ACCOUNT = process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456';

const pendingRequest = {
  id: 'req-1',
  username: 'builder',
  room: { author: 'alice', permlink: 'current-room' },
  newRoom: { permlink: 'new-forest', author: 'builder' },
  title: 'New Forest',
  body: 'A lush forest.',
  exits: {
    fromCurrentRoom: { north: 'builder/new-forest' },
    fromNewRoom: { south: 'alice/current-room' },
  },
  timestamp: 1000000,
  status: 'pending' as const,
  timeEvent: null,
};

describe('QueueManagementModal', () => {
  let mockPost: jest.Mock;
  let mockBroadcast: jest.Mock;
  let mockGetAccounts: jest.Mock;
  let mockGetCurrentBlockNum: jest.Mock;
  let mockBuildApprovalQueue: jest.Mock;
  let defaultProps: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'alert').mockImplementation(() => {});

    mockBuildApprovalQueue = jest.fn().mockResolvedValue([]);
    defaultProps = {
      isOpen: true,
      onClose: jest.fn(),
      username: GAME_ACCOUNT,
      buildApprovalQueue: mockBuildApprovalQueue,
      onError: jest.fn(),
    };

    mockPost = jest.fn().mockResolvedValue({ success: true });
    mockBroadcast = jest.fn().mockResolvedValue({ success: true });
    MockKeychainSDK.mockImplementation(() => ({ post: mockPost, broadcast: mockBroadcast }));

    mockGetAccounts = jest.fn().mockResolvedValue([{
      posting_json_metadata: JSON.stringify({
        egodeathgamedata: { rooms_authors_exits: {} }
      })
    }]);
    mockGetCurrentBlockNum = jest.fn().mockResolvedValue(12345);
    MockDhiveClient.mockImplementation(() => ({
      database: { getAccounts: mockGetAccounts },
      blockchain: { getCurrentBlockNum: mockGetCurrentBlockNum },
    }));
  });

  it('renders nothing when closed', () => {
    const { container } = render(<QueueManagementModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "No pending build requests" when queue is empty', async () => {
    render(<QueueManagementModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending build requests/i)).toBeInTheDocument();
    });
  });

  it('calls buildApprovalQueue when open and username matches game account', async () => {
    render(<QueueManagementModal {...defaultProps} />);
    await waitFor(() => {
      expect(defaultProps.buildApprovalQueue).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call buildApprovalQueue when username does not match game account', async () => {
    render(<QueueManagementModal {...defaultProps} username="someuser" />);
    await waitFor(() => {
      expect(defaultProps.buildApprovalQueue).not.toHaveBeenCalled();
    });
  });

  it('does not call buildApprovalQueue when closed', async () => {
    render(<QueueManagementModal {...defaultProps} isOpen={false} />);
    expect(defaultProps.buildApprovalQueue).not.toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', () => {
    render(<QueueManagementModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders build requests when queue returns data', async () => {
    const buildApprovalQueue = jest.fn().mockResolvedValue([pendingRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => {
      expect(screen.getByText('Request from builder')).toBeInTheDocument();
      expect(screen.getByText('New Forest')).toBeInTheDocument();
    });
  });

  it('shows rejection form when Reject button clicked', async () => {
    const buildApprovalQueue = jest.fn().mockResolvedValue([pendingRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => screen.getByRole('button', { name: /^reject$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(screen.getByPlaceholderText(/enter reason for rejection/i)).toBeInTheDocument();
  });

  it('alerts when rejection submitted without a reason', async () => {
    const buildApprovalQueue = jest.fn().mockResolvedValue([pendingRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => screen.getByRole('button', { name: /^reject$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit rejection/i }));
    expect(window.alert).toHaveBeenCalledWith('Please provide a reason for rejection');
  });

  it('calls keychain.post and updates status on successful rejection', async () => {
    const buildApprovalQueue = jest.fn().mockResolvedValue([pendingRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => screen.getByRole('button', { name: /^reject$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    fireEvent.change(screen.getByPlaceholderText(/enter reason for rejection/i), {
      target: { value: 'Not suitable for the game world.' }
    });
    fireEvent.click(screen.getByRole('button', { name: /submit rejection/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
      const commentData = mockPost.mock.calls[0][0];
      expect(commentData.body).toContain('Rejected: Not suitable for the game world.');
    });
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('rejected'));
    });
  });

  it('calls keychain.broadcast and updates status on successful approval', async () => {
    const buildApprovalQueue = jest.fn().mockResolvedValue([pendingRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => {
      expect(mockGetAccounts).toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('approved'));
    });
  });

  it('keeps the profile, other keys and the source room timeEvent when approving', async () => {
    const sourceTimeEvent = { type: 'ferry', intervalBlocks: 10, startBlock: 1, phases: [] };
    mockGetAccounts.mockResolvedValue([{
      posting_json_metadata: JSON.stringify({
        profile: { name: 'Ego Death', about: 'A text adventure', profile_image: 'https://example.com/a.png' },
        other_app: { keep: true },
        egodeathgamedata: {
          version: 3,
          rooms_authors_exits: {
            'current-room': { author: 'alice', exits: { east: 'somewhere' }, timeEvent: sourceTimeEvent }
          }
        }
      })
    }]);
    const buildApprovalQueue = jest.fn().mockResolvedValue([pendingRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(mockBroadcast).toHaveBeenCalled());

    const op = mockBroadcast.mock.calls[0][0].operations[0][1];
    const written = JSON.parse(op.posting_json_metadata);
    expect(written.profile).toEqual({ name: 'Ego Death', about: 'A text adventure', profile_image: 'https://example.com/a.png' });
    expect(written.other_app).toEqual({ keep: true });
    expect(written.egodeathgamedata.version).toBe(3);
    const rooms = written.egodeathgamedata.rooms_authors_exits;
    expect(rooms['current-room'].timeEvent).toEqual(sourceTimeEvent);
    expect(rooms['current-room'].exits).toEqual({ east: 'somewhere', north: 'builder/new-forest' });
    expect(rooms['new-forest'].author).toBe('builder');
  });

  it('shows rejected status on a rejected request', async () => {
    const rejectedRequest = { ...pendingRequest, status: 'rejected' as const, rejectionReason: 'Out of scope.' };
    const buildApprovalQueue = jest.fn().mockResolvedValue([rejectedRequest]);
    render(<QueueManagementModal {...defaultProps} buildApprovalQueue={buildApprovalQueue} />);
    await waitFor(() => {
      expect(screen.getByText(/rejected/i)).toBeInTheDocument();
      expect(screen.getByText(/out of scope\./i)).toBeInTheDocument();
    });
  });
});
