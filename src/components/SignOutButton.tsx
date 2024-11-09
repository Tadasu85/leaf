interface SignOutButtonProps {
  isSignedIn: boolean;
  username?: string; // Optional username
  onSignOut: () => void;
}

function SignOutButton({ isSignedIn, username, onSignOut }: SignOutButtonProps) {
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

export default SignOutButton;