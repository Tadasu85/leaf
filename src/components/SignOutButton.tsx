import React from 'react';

interface SignOutButtonProps {
  isSignedIn: boolean;
  username?: string; // Optional username
  onSignOut: () => void;
  userProfileJSON?: {
    profile_image?: string;
  };
}

function SignOutButton({ isSignedIn, username, onSignOut, userProfileJSON }: SignOutButtonProps) {
  if (isSignedIn) {
    return (
      <div onClick={onSignOut}>
        <p>Signed in as: {username}</p>
        <button>Sign Out</button>
        {userProfileJSON?.profile_image && (
          <img src={userProfileJSON.profile_image} alt="ProfileImage"/>
        )}
      </div>
    );
  } else {
    // You can add the logic for the not signed-in state here.
    return null;
  }
}

export default SignOutButton;