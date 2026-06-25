import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddDetailModal from '../../components/AddDetailModal';
import { KeychainSDK } from 'keychain-sdk';

jest.mock('keychain-sdk', () => ({
  KeychainSDK: jest.fn(),
}));

const MockKeychainSDK = KeychainSDK as jest.Mock;

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  username: 'alice',
  currentRoom: { author: 'bob', permlink: 'some-room' },
  onDetailAdded: jest.fn(),
  onError: jest.fn(),
};

describe('AddDetailModal', () => {
  let mockPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPost = jest.fn().mockResolvedValue({ success: true });
    MockKeychainSDK.mockImplementation(() => ({ post: mockPost }));
  });

  it('renders nothing when closed', () => {
    const { container } = render(<AddDetailModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the form when open', () => {
    render(<AddDetailModal {...defaultProps} />);
    expect(screen.getByText('Add Room Detail')).toBeInTheDocument();
    expect(screen.getByLabelText(/detail name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detail description/i)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button clicked', () => {
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error when username is null', async () => {
    render(<AddDetailModal {...defaultProps} username={null} />);
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByText(/must be logged in/i)).toBeInTheDocument();
    });
  });

  it('shows error when currentRoom is null', async () => {
    render(<AddDetailModal {...defaultProps} currentRoom={null} />);
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByText(/must be logged in/i)).toBeInTheDocument();
    });
  });

  it('shows error when fields are empty', async () => {
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByText(/please provide both/i)).toBeInTheDocument();
    });
  });

  it('updates inputs on change', () => {
    render(<AddDetailModal {...defaultProps} />);
    const nameInput = screen.getByLabelText(/detail name/i);
    const descInput = screen.getByLabelText(/detail description/i);
    fireEvent.change(nameInput, { target: { name: 'detailName', value: 'Ancient Book' } });
    fireEvent.change(descInput, { target: { name: 'detailDescription', value: 'A dusty tome.' } });
    expect((nameInput as HTMLInputElement).value).toBe('Ancient Book');
    expect((descInput as HTMLTextAreaElement).value).toBe('A dusty tome.');
  });

  it('calls onDetailAdded and onClose after successful submit', async () => {
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/detail name/i), { target: { name: 'detailName', value: 'Ancient Book' } });
    fireEvent.change(screen.getByLabelText(/detail description/i), { target: { name: 'detailDescription', value: 'A dusty tome.' } });
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(defaultProps.onDetailAdded).toHaveBeenCalled();
    });
  });

  it('shows error and calls onError when keychain post fails', async () => {
    mockPost.mockResolvedValue({ success: false, message: 'User cancelled' });
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/detail name/i), { target: { name: 'detailName', value: 'Book' } });
    fireEvent.change(screen.getByLabelText(/detail description/i), { target: { name: 'detailDescription', value: 'A tome.' } });
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to add detail/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalledWith(expect.stringMatching(/failed to add detail/i));
    });
  });

  it('shows error and calls onError when keychain throws', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/detail name/i), { target: { name: 'detailName', value: 'Book' } });
    fireEvent.change(screen.getByLabelText(/detail description/i), { target: { name: 'detailDescription', value: 'A tome.' } });
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByText(/error: network error/i)).toBeInTheDocument();
      expect(defaultProps.onError).toHaveBeenCalledWith(expect.stringMatching(/network error/i));
    });
  });

  it('shows generic error when keychain throws non-Error', async () => {
    mockPost.mockRejectedValue('something went wrong');
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/detail name/i), { target: { name: 'detailName', value: 'Book' } });
    fireEvent.change(screen.getByLabelText(/detail description/i), { target: { name: 'detailDescription', value: 'A tome.' } });
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByText(/an error occurred/i)).toBeInTheDocument();
    });
  });

  it('disables buttons while submitting', async () => {
    let resolvePost: (val: any) => void;
    mockPost.mockImplementation(() => new Promise(res => { resolvePost = res; }));
    render(<AddDetailModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/detail name/i), { target: { name: 'detailName', value: 'Book' } });
    fireEvent.change(screen.getByLabelText(/detail description/i), { target: { name: 'detailDescription', value: 'A tome.' } });
    fireEvent.click(screen.getByRole('button', { name: /add detail/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /adding\.\.\./i })).toBeDisabled();
    });
    resolvePost!({ success: true });
  });
});
