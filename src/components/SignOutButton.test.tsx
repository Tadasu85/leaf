import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SignOutButton from './SignOutButton';

describe('SignOutButton', () => {
  const mockOnSignOut = jest.fn();
  const defaultProps = {
    isSignedIn: true,
    username: 'testuser',
    onSignOut: mockOnSignOut
  };

  beforeEach(() => {
    mockOnSignOut.mockClear();
  });

  test('renders nothing when not signed in', () => {
    const { container } = render(
      <SignOutButton
        {...defaultProps}
        isSignedIn={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders sign out button with username when signed in', () => {
    render(<SignOutButton {...defaultProps} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Sign Out testuser');
  });

  test('calls onSignOut when sign out button is clicked', () => {
    render(<SignOutButton {...defaultProps} />);
    
    const signOutButton = screen.getByRole('button');
    fireEvent.click(signOutButton);
    
    expect(mockOnSignOut).toHaveBeenCalledTimes(1);
  });

  test('handles missing username gracefully', () => {
    const propsWithoutUsername = {
      ...defaultProps,
      username: undefined
    };
    
    render(<SignOutButton {...propsWithoutUsername} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Sign Out');
  });
}); 