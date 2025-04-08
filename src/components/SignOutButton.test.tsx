import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react'; // Add this line
import SignOutButton from './SignOutButton';

describe('SignOutButton', () => {
  const mockOnSignOut = jest.fn();
  const defaultProps = {
    isSignedIn: true,
    username: 'testuser',
    onSignOut: mockOnSignOut,
    userProfileJSON: {
      profile_image: 'https://example.com/profile.jpg'
    }
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

  test('renders user information when signed in', () => {
    render(<SignOutButton {...defaultProps} />);
    
    expect(screen.getByText('Signed in as: testuser')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
    expect(screen.getByAltText('ProfileImage')).toBeInTheDocument();
  });

  test('calls onSignOut when sign out button is clicked', () => {
    render(<SignOutButton {...defaultProps} />);
    
    const signOutButton = screen.getByRole('button', { name: 'Sign Out' });
    fireEvent.click(signOutButton);
    
    expect(mockOnSignOut).toHaveBeenCalledTimes(1);
  });

  test('displays profile image with correct src', () => {
    render(<SignOutButton {...defaultProps} />);
    
    const profileImage = screen.getByAltText('ProfileImage');
    expect(profileImage).toHaveAttribute('src', 'https://example.com/profile.jpg');
  });

  test('handles missing username gracefully', () => {
    const propsWithoutUsername = {
      ...defaultProps,
      username: undefined
    };
    
    render(<SignOutButton {...propsWithoutUsername} />);
    
    expect(screen.getByText('Signed in as:')).toBeInTheDocument();
  });

  test('handles missing userProfileJSON gracefully', () => {
    const propsWithoutProfile = {
      ...defaultProps,
      userProfileJSON: undefined
    };
    
    render(<SignOutButton {...propsWithoutProfile} />);
    
    expect(screen.getByText('Signed in as: testuser')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
  });
}); 