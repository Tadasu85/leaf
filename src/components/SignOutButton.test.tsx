import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SignOutButton from './SignOutButton';

describe('SignOutButton', () => {
  const mockOnSignOut = jest.fn();

  beforeEach(() => {
    mockOnSignOut.mockClear();
  });

  it('should not render when not signed in', () => {
    render(<SignOutButton isSignedIn={false} onSignOut={mockOnSignOut} />);
    
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should render when signed in', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button', { name: /Sign Out/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('SignOutButton');
  });

  it('should display username when provided', () => {
    render(<SignOutButton isSignedIn={true} username="testuser" onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Sign Out');
    expect(button).toHaveTextContent('testuser');
  });

  it('should call onSignOut when clicked', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button', { name: /Sign Out/i });
    fireEvent.click(button);
    
    expect(mockOnSignOut).toHaveBeenCalledTimes(1);
  });

  it('should have correct CSS class', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('SignOutButton');
  });

  it('should render without username when not provided', () => {
    render(<SignOutButton isSignedIn={true} onSignOut={mockOnSignOut} />);
    
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
  });
}); 