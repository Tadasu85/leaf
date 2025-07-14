import React from 'react';

interface SignOutButtonProps {
  isSignedIn: boolean;
  username?: string;
  onSignOut: () => void;
}

const SignOutButton: React.FC<SignOutButtonProps> = ({ isSignedIn, username, onSignOut }) => {
  if (!isSignedIn) return null; // Don't render if not signed in

  return (
    <button className="signout__button" onClick={onSignOut}>
      Sign Out {username}
    </button>
  );
};

export default SignOutButton;