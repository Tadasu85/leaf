import React from 'react';
import SignOutButton from './SignOutButton';

interface HeaderProps {
  isSignedIn: boolean;
  username: string | null;
  userProfileJSON: {
    profile_image?: string;
  };
  onSignOut: () => void;
}

const Header: React.FC<HeaderProps> = ({
  isSignedIn,
  username,
  userProfileJSON,
  onSignOut
}) => {
  return (
    <header className="app__header">
      <img 
        className="app__title" 
        src={require('../assets/egodeathbanner.png')} 
        alt="Ego Death Banner" 
      />
      <div className="app__header-buttons">
        {isSignedIn && (
          <div className="app__user-signout-container">
            {userProfileJSON.profile_image && (
              <img 
                src={userProfileJSON.profile_image} 
                alt="User Icon" 
                className="app__user-icon" 
              />
            )}
            <SignOutButton 
              isSignedIn={isSignedIn} 
              username={username || undefined}
              onSignOut={onSignOut}
            />
          </div>
        )}
      </div>
    </header>
  );
};

export default Header; 