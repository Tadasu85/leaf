import './App.css';
import GameOutputWindow from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import BuildButton from './components/BuildButton';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { useSocket } from './hooks/useSocket';
import { useModalState } from './hooks/useModalState';
import { useClients } from './hooks/useClients';
import { useGameOutput } from './hooks/useGameOutput';
import BuildModal from './components/BuildModal';
import QueueButton from './components/QueueButton';
import QueueManagementModal from './components/QueueManagementModal';
import { KeychainKeyTypes } from 'keychain-sdk';
import config from './config';

// Add process polyfill for browser environment
declare global {
  interface Window {
    process: {
      env: {
        NODE_ENV: string;
      };
    };
  }
}

window.process = window.process || {
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
};

// Add PresentPlayers component
function PresentPlayers({ players, currentUser }: { players: string[]; currentUser?: string | null }) {
  if (!players || players.length === 0) return null;
  return (
    <div className="PresentPlayers">
      <span className="PresentPlayers__label">Present:</span>
      {players.map((p) => (
        <span key={p} className={p === currentUser ? 'PresentPlayers__me' : ''}>{p}</span>
      ))}
    </div>
  );
}

function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [presentPlayers, setPresentPlayers] = useState<string[]>([]);

  const { client, keychain } = useClients();

  // Use the new consolidated game hook (now with command and location logic)
  const {
    // Game State
    gameState,
    player,
    currentRoom,
    login,
    
    // Room State
    isLoadedGame,
    
    // Game Data
    fetchGameData,
    checkIfUserIsBuilder,
    
    // User State
    userProfileJSON,
    setUserProfileJSON,
    isBuilder,
    isAdmin,
    updateUserProfile,
    // Command and move logic
    handleCommand,
    loading,
    buildApprovalQueue
  } = useGame(client, keychain);

  // Use the new centralized output management
  const {
    messages: gameOutputMessages,
    addErrorMessage,
    addSuccessMessage,
    addInfoMessage
  } = useGameOutput(gameState);

  const {
    connect,
    joinRoom,
    leaveRoom,
    getCurrentRoomIdentifier,
    resetRoomStateTracking
  } = useSocket(gameState);

  // Debug logging for useSocket hook
  // console.log('[App Debug] useSocket hook called with gameState:', gameState);
  // console.log('[App Debug] gameState type:', typeof gameState);
  // console.log('[App Debug] gameState player:', gameState?.getPlayer());

  const {
    isBuildModalOpen,
    isQueueModalOpen,
    toggleBuildModal,
    toggleQueueModal
  } = useModalState();

  // Refs
  const hasShownGreeting = useRef(false);
  const lastConnectedRef = useRef<{ username: string; location: any } | null>(null);

  // Constants
  const gameGreeting = useMemo(() => [
    "If you've arrived here by accident and do not have a Hive account. ",
    "Please make your way to https://ecency.com/ to create an account.",
    "Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
    "You will also need the hive keychain extension installed and the account added.",
    "If this is successful you will see your username in the top right."
  ], []);

  // Effects
  useEffect(() => {
    if (!hasShownGreeting.current) {
      gameGreeting.forEach((item) => {
        addInfoMessage(item);
      });
      hasShownGreeting.current = true;
    }
  }, [gameGreeting, addInfoMessage]);

  // Handle login success (prevent repeated connect calls)
  useEffect(() => {
    if (player && player.location) {
      const last = lastConnectedRef.current;
      if (!last || last.username !== player.username || JSON.stringify(last.location) !== JSON.stringify(player.location)) {
        connect(player.username, player.location);
        lastConnectedRef.current = { username: player.username, location: player.location };
      }
    }
  }, [player, connect]);

  // Handle room changes
  useEffect(() => {
    if (player && currentRoom) {
      const currentRoomId = getCurrentRoomIdentifier();
      const newRoomId = `${currentRoom.author}/${currentRoom.permlink}`;
      
      // Only join room if we're not already in the correct room
      if (currentRoomId !== newRoomId) {
        if (currentRoomId) {
          leaveRoom(currentRoomId, player.username);
          // Reset room state tracking when changing rooms
          resetRoomStateTracking();
          
          // Add a longer delay to ensure leaveRoom is fully processed
          setTimeout(() => {
            joinRoom(newRoomId);
          }, 200);
        } else {
          // No current room, join immediately
          joinRoom(newRoomId);
        }
      }
    }
  }, [currentRoom, player, joinRoom, leaveRoom, getCurrentRoomIdentifier, resetRoomStateTracking]);

  // Load game data on mount
  useEffect(() => {
    if (!isLoadedGame) {
      fetchGameData();
    }
  }, [fetchGameData, isLoadedGame]);

  // Listen for roomUpdate and roomState events to update presentPlayers
  useEffect(() => {
    if (!gameState) return;
    const handleRoomUpdate = (data: any) => {
      if (data && Array.isArray(data.players)) {
        setPresentPlayers(data.players);
      }
    };
    gameState.on('roomUpdate', handleRoomUpdate);
    gameState.on('roomState', handleRoomUpdate);
    return () => {
      gameState.off('roomUpdate', handleRoomUpdate);
      gameState.off('roomState', handleRoomUpdate);
    };
  }, [gameState]);

  const handleTextEnteredWrapper = useCallback((text: string) => {
    console.log('[TextInput Debug] handleTextEnteredWrapper called with:', text);
    
    if (text.startsWith('login ')) {
      const username = text.split(' ')[1];
      if (!username) {
        addErrorMessage('Please provide a username: login <username>');
        return;
      }
      keychain.login({ 
        username,
        method: KeychainKeyTypes.posting
      })
        .then((result) => {
          if (result.success) {
            setUsername(username);
            setIsSignedIn(true);
            
            // Check if user is admin account
            const isUserAdmin = username === config.game.account;
            const isUserBuilder = checkIfUserIsBuilder(username);
            
            // Update user profile
            updateUserProfile(username);
            
            // Login to game state
            addInfoMessage('Logging into game state...');
            login(username).then(() => {
              if (gameState) {
                // Set builder status after login
                gameState.setBuilderStatus(isUserBuilder);
              }

              if (isUserAdmin) {
                addSuccessMessage(`Admin login successful as ${username}`);
                addInfoMessage('Welcome to the admin panel. Use the Queue button to manage build requests.');
              } else if (isUserBuilder) {
                addSuccessMessage(`Builder login successful as ${username}`);
                addInfoMessage('Welcome! You can use the Build button to create and modify rooms.');
              } else {
                addSuccessMessage(`Login successful as ${username}`);
              }
            }).catch((error) => {
              addErrorMessage(`Game login failed: ${error.message}`);
              // Reset login state if game login fails
              setIsSignedIn(false);
              setUsername(null);
            });
          } else {
            addErrorMessage('Login failed. Please check your Keychain and try again.');
          }
        });
    } else {
      // Only allow commands if user is signed in AND game state has a player
      if (!isSignedIn) {
        addErrorMessage('Please login first.');
        return;
      }
      // Check if game state has a player (more reliable than hook state)
      if (gameState && !gameState.getPlayer()) {
        addErrorMessage('Please wait for login to complete.');
        return;
      }
      console.log('[TextInput Debug] Calling handleCommand with:', text);
      handleCommand(text);
    }
  }, [keychain, addErrorMessage, addSuccessMessage, addInfoMessage, handleCommand, login, checkIfUserIsBuilder, updateUserProfile, gameState, isSignedIn]);

  const handleSignOut = useCallback(() => {
    setIsSignedIn(false);
    setUsername(null);
    setUserProfileJSON({});
    updateUserProfile(null);
    addInfoMessage('You have been signed out.');
  }, [setUserProfileJSON, updateUserProfile, addInfoMessage]);

  return (
    <div className="App">
      {loading && (
        <div className="loading-overlay">
          <div className="loading-overlay__content">
            <span className="loading-overlay__spinner"></span>
            Processing...
          </div>
        </div>
      )}
      <header className="App-header">
        <div className="Title">E̴̙̣̦̩̱̮͇̋̐̏̕G̶̱͕̦͎̯͙̳̋̽͒͋̾͌̌̚͜O̴̪̤͎̼͙̫͌̏͒̑̍̏͜͠ ̶̗͎̯̥̮̲̠̝̮̲̃͆͊̽Ḇ̶̘̞̂Ȇ̶̹͎͓̳̼͇̠͜ͅA̸͖͖̠̖̙̐̍̀̉̍̾̇̚Ṯ̷̜̀̆͗̏͊͘̚H̴̛̼</div>
        <div className="header-buttons">
          {isSignedIn && (
            <div className="user-signout-container">
              {userProfileJSON.profile_image && (
                <img src={userProfileJSON.profile_image} alt="User Icon" className="user-icon" />
              )}
              <SignOutButton 
                isSignedIn={isSignedIn} 
                username={username || undefined}
                onSignOut={handleSignOut}
              />
            </div>
          )}
          {isSignedIn && isBuilder && (
            <BuildButton 
              onClick={toggleBuildModal}
              label="Build"
              isActive={isBuildModalOpen}
            />
          )}
          {isSignedIn && username === config.game.account && (
            <QueueButton
              onClick={toggleQueueModal}
              label="Queue"
              isActive={isQueueModalOpen}
            />
          )}
        </div>
      </header>
      {!isAdmin && (
        <>
          <PresentPlayers players={presentPlayers} currentUser={username} />
          <GameOutputWindow 
            output={gameOutputMessages} 
            maxMessages={200}
          />
          <div className="TextInputBox">
            <TextInputBox onEnterPressed={handleTextEnteredWrapper} isLoading={loading} />
          </div>
        </>
      )}
      <BuildModal
        isOpen={isBuildModalOpen && !isAdmin}
        onClose={toggleBuildModal}
        username={username}
        currentRoom={currentRoom ? {
          author: currentRoom.author,
          permlink: currentRoom.permlink
        } : null}
        onRoomCreated={() => {
          fetchGameData();
          if (username) {
            updateUserProfile(username);
          }
        }}
        onBuildQueued={() => {
          addSuccessMessage('Room created successfully! It will be available for admin approval.');
        }}
      />
      <QueueManagementModal
        isOpen={isQueueModalOpen}
        onClose={toggleQueueModal}
        username={username}
        buildApprovalQueue={buildApprovalQueue}
      />
    </div>
  );
}

export default App;