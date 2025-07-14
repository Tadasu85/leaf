import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SignOutButton from '../../components/SignOutButton';

describe('SignOutButton Component', () => {
  const mockOnSignOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when signed in', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('does not render when not signed in', () => {
    render(<SignOutButton isSignedIn={false} onSignOut={mockOnSignOut} />);
    
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('displays username when provided', () => {
    render(<SignOutButton isSignedIn={true} username="testuser" onSignOut={mockOnSignOut} />);
    
    expect(screen.getByRole('button', { name: 'Sign Out testuser' })).toBeInTheDocument();
  });

  it('displays sign out without username when username is not provided', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    // The component renders "Sign Out" (without trailing space) when no username
    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toHaveTextContent('Sign Out');
  });

  it('calls onSignOut when clicked', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(button);
    
    expect(mockOnSignOut).toHaveBeenCalledTimes(1);
  });

  it('has the correct CSS class', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toHaveClass('signout__button');
  });

  it('handles empty username gracefully', () => {
    render(<SignOutButton isSignedIn={true} username="" onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toHaveTextContent('Sign Out');
  });

  it('handles undefined username gracefully', () => {
    render(<SignOutButton isSignedIn={true} username={undefined} onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toHaveTextContent('Sign Out');
  });
}); 