import './App.css';
import GameOutputWindow from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import BuildButton from './components/BuildButton';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGameContext } from './contexts/GameContext';
import { useSocket } from './hooks/useSocket';
import { useModalState } from './hooks/useModalState';
import { useClients } from './hooks/useClients';
import { useGameOutput } from './hooks/useGameOutput';
import BuildModal from './components/BuildModal';
import QueueButton from './components/QueueButton';
import QueueManagementModal from './components/QueueManagementModal';
import { KeychainKeyTypes } from 'keychain-sdk';
import config from './config';
import { MemoryMonitor } from './components/MemoryMonitor';

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

  const { keychain } = useClients();

  // Use the new centralized game context
  const {
    gameState,
    player,
    currentRoom,
    login,
    isLoginComplete,
    isLoadedGame,
    userProfileJSON,
    isBuilder,
    isAdmin,
    updateUserProfile,
    updateGameJSON
  } = useGameContext();

  // Use the new centralized output management
  const {
    messages: gameOutputMessages,
    addErrorMessage,
    addSuccessMessage,
    addInfoMessage
  } = useGameOutput(gameState);

  // Debug logging - only log when values actually change
  useEffect(() => {
    // Debug logging removed for cleaner console output
  }, [gameState]);

  useEffect(() => {
    // Debug logging removed for cleaner console output
  }, [player]);

  useEffect(() => {
    // Debug logging removed for cleaner console output
  }, [currentRoom]);

  useEffect(() => {
    // Debug logging removed for cleaner console output
  }, [isLoginComplete]);

  // Command handler that processes actual commands
  const handleCommand = useCallback((text: string) => {
    if (!gameState) {
      addErrorMessage('Game state not available');
      return;
    }

    // Get current room exits for command validation
    const currentRoomPermlink = player?.location.permlink;
    const currentRoomExits = currentRoom?.exits;
    
    // Import CommandParser dynamically to avoid circular dependencies
    const { CommandParser } = require('./game/commands/CommandParser');
    const commandParser = new CommandParser();
    
    const command = commandParser.parse(text, currentRoomExits);
    if (!command) {
      addErrorMessage('Invalid command. Type "help" for a list of commands.');
      return;
    }
    
    switch (command.type) {
      case 'move':
        const direction = command.args[0];
        
        if (!currentRoomPermlink) {
          addErrorMessage('Cannot determine current location.');
          return;
        }
        
        // Look up the exit in the current room
        if (!currentRoomExits || !currentRoomExits[direction]) {
          addErrorMessage(`You cannot go ${direction}.`);
          return;
        }
        
        // Use the gameState's move method
        gameState.move(direction);
        break;
      case 'say':
        gameState.say(command.args[0]);
        break;
      case 'emote':
        gameState.emote(command.args[0]);
        break;
      case 'look':
        gameState.look();
        break;
      case 'help':
        gameState.help();
        break;
      case 'describe':
        gameState.setDescription(command.args[0]);
        break;
      case 'describeshort':
        gameState.setShortDescription(command.args[0]);
        break;
      case 'lookAt':
        const target = command.args[0];

        // 1. Special case for "look self" or "look me"
        if (["self", "me"].includes(target.toLowerCase())) {
          gameState.lookAtSelf();
          break;
        }

        const currentRoom = gameState.getCurrentRoom();
        if (!currentRoom) {
          addErrorMessage('No current room found');
          break;
        }

        // 2. Check if the target is a player in the room
        const roomPlayers = currentRoom.players || [];
        const isPlayerInRoom = roomPlayers.some(player => player.toLowerCase() === target.toLowerCase());
        if (isPlayerInRoom) {
          gameState.lookAtPlayer(target);
          break;
        }

        // 3. Check if the detail exists in the room
        const roomDetails = (currentRoom as any).details || {};
        let detailKey = Object.keys(roomDetails).find(key => key.toLowerCase() === target.toLowerCase());
        if (!detailKey) {
          detailKey = Object.keys(roomDetails).find(key =>
            key.toLowerCase().includes(target.toLowerCase()) ||
            target.toLowerCase().includes(key.toLowerCase())
          );
        }
        if (detailKey) {
          addInfoMessage(detailKey);
          addInfoMessage(roomDetails[detailKey]);
        } else {
          addErrorMessage(`You don't see "${target}" here.`);
        }
        break;
      default:
        addErrorMessage('Unknown command. Type "help" for a list of commands.');
    }
  }, [gameState, player, currentRoom, addErrorMessage, addInfoMessage]);

  // Simple build approval queue for now
  const buildApprovalQueue = useCallback(async () => {
    // For now, return empty array
    return [];
  }, []);

  const {
    connect,
    joinChatChannel,
    leaveChatChannel,
    getCurrentChannelId,
    resetChannelStateTracking,
    connectionStatus,
    isConnected
  } = useSocket(gameState);

  // Debug logging for connection status - only log when it changes
  useEffect(() => {
    if (isSignedIn) {
      // Debug logging removed for cleaner console output
    }
  }, [connectionStatus, isSignedIn]);

  // Debug logging for useSocket hook
  // Debug logging removed for cleaner console output

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
    if (player && player.location && isLoginComplete) {
      const last = lastConnectedRef.current;
      if (!last || last.username !== player.username || JSON.stringify(last.location) !== JSON.stringify(player.location)) {
        connect(player.username, player.location);
        lastConnectedRef.current = { username: player.username, location: player.location };
      }
    }
  }, [player, connect, isLoginComplete]);

  // Handle room changes - join corresponding chat channel and game room
  useEffect(() => {
    // Skip if we don't have all required data
    if (!player || !currentRoom || !isLoginComplete) {
      console.log('[App] Not ready to join room:', {
        hasPlayer: !!player,
        hasCurrentRoom: !!currentRoom,
        isLoginComplete,
        isConnected: isConnected()
      });
      return;
    }

    // Skip if socket is not connected yet - let the connection effect handle it
    if (!isConnected()) {
      console.log('[App] Socket not connected yet, waiting for connection');
      return;
    }

    const currentChannelId = getCurrentChannelId();
    const newChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
    
    console.log('[App] Room change effect triggered:', { 
      player: player.username, 
      currentRoom: newChannelId,
      isLoginComplete,
      isConnected: isConnected(),
      currentChannelId
    });
    
    // Only join chat channel if we're not already in the correct channel
    if (currentChannelId !== newChannelId) {
      console.log('[App] Joining new channel:', newChannelId);
      if (currentChannelId) {
        // Leave current chat channel
        console.log('[App] Leaving current channel:', currentChannelId);
        leaveChatChannel(currentChannelId, player.username);
        resetChannelStateTracking();
      }
      // Join new channel immediately
      joinChatChannel(newChannelId);
    } else {
      console.log('[App] Already in correct channel:', newChannelId);
    }
  }, [currentRoom?.author, currentRoom?.permlink, player?.username, isLoginComplete, isConnected, joinChatChannel, leaveChatChannel, getCurrentChannelId, resetChannelStateTracking, currentRoom, player]);

  // Handle initial room join when socket connects
  useEffect(() => {
    console.log('[App] Socket connection effect triggered:', {
      player: !!player,
      currentRoom: !!currentRoom,
      isLoginComplete,
      connectionStatus,
      currentChannelId: getCurrentChannelId()
    });
    
    if (player && currentRoom && isLoginComplete && connectionStatus === 'connected') {
      const currentChannelId = getCurrentChannelId();
      const newChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
      
      // Only join if we're not already in the correct channel
      if (currentChannelId !== newChannelId) {
        console.log('[App] Socket connected, joining initial room:', newChannelId);
        joinChatChannel(newChannelId);
      } else {
        console.log('[App] Already in correct channel, not joining:', newChannelId);
      }
    }
  }, [connectionStatus, player, currentRoom, isLoginComplete, joinChatChannel, getCurrentChannelId]);

  // Sync game JSON when it's loaded
  useEffect(() => {
    if (gameState && isLoadedGame) {
      const gameMap = gameState.getHiveClient().getGameMap();
      updateGameJSON(gameMap);
    }
  }, [gameState, isLoadedGame, updateGameJSON]);

  // Listen for chat channel events to update present players
  useEffect(() => {
    if (!gameState) return;
    const handleChatChannelUpdate = (data: any) => {
      if (data && Array.isArray(data.players)) {
        console.log('[App] Updating present players:', data.players);
        setPresentPlayers(data.players);
      }
    };
    gameState.on('chatChannelUpdate', handleChatChannelUpdate);
    gameState.on('chatChannelState', handleChatChannelUpdate);
    return () => {
      gameState.off('chatChannelUpdate', handleChatChannelUpdate);
      gameState.off('chatChannelState', handleChatChannelUpdate);
    };
  }, [gameState]);

  const handleTextEnteredWrapper = useCallback(async (text: string) => {
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
        .then(async (result) => {
          if (result.success) {
            setUsername(username);
            setIsSignedIn(true);
            
            // Check if user is admin account
            const isUserAdmin = username === config.game.account;
            
            // Update user profile and wait for builder state
            await updateUserProfile(username);
            
            // Login to game state
            addInfoMessage('Logging into game state...');
            login(username).then(() => {
              if (gameState) {
                // Set builder status after login - use the current isBuilder state
                gameState.setBuilderStatus(isBuilder);
              }

              if (isUserAdmin) {
                addInfoMessage('Welcome to the admin panel. Use the Queue button to manage build requests.');
              } else if (isBuilder) {
                addInfoMessage('Welcome! You can use the Build button to create and modify rooms.');
              }
              // Regular users don't need any additional messages - the game state speaks for itself
            }).catch((error) => {
              addErrorMessage(`Game login failed: ${error.message}`);
              // Reset login state if game login fails
              setIsSignedIn(false);
              setUsername(null);
            });
          } else {
            addErrorMessage('Keychain login failed. Please check your Keychain extension.');
          }
        })
        .catch((error) => {
          addErrorMessage(`Login error: ${error.message}`);
        });
    } else {
      // Handle other commands
      handleCommand(text);
    }
  }, [keychain, updateUserProfile, login, gameState, isBuilder, addErrorMessage, addInfoMessage, handleCommand]);

  const handleSignOut = useCallback(() => {
    setUsername(null);
    setIsSignedIn(false);
    updateUserProfile(null);
    addInfoMessage('You have been signed out.');
  }, [updateUserProfile, addInfoMessage]);

  return (
    <div className="App">
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
            <TextInputBox onEnterPressed={handleTextEnteredWrapper} />
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
      <MemoryMonitor 
        hiveClient={gameState?.getHiveClient() || null}
        isVisible={process.env.NODE_ENV === 'development'}
      />
    </div>
  );
}

export default App;