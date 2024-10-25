import React from 'react';

interface SignInButtonProps {
  isSignedIn: boolean;
  username?: string; // Optional username
  onSignOut: () => void;
}

function SignInButton({ isSignedIn, username, onSignOut }: SignInButtonProps) {
  if (isSignedIn) {
    return (
      <div>
        <p>Signed in as: {username}</p>
        <button onClick={onSignOut}>Sign Out</button>
      </div>
    );
  } else {
    // You can add the logic for the not signed-in state here.
    return null;
  }
}

export default SignInButton;