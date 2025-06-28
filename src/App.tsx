import './App.css';
import GameOutputWindow from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import BuildButton from './components/BuildButton';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGameState } from './hooks/useGameState';
import { useRoomState } from './hooks/useRoomState';
import { useGameData } from './hooks/useGameData';
import { useUserProfile } from './hooks/useUserProfile';
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

  const { client, keychain } = useClients();

  // Use the new separated hooks architecture
  const {
    gameState,
    player,
    currentRoom,
    login,
    isLoginComplete
  } = useGameState();

  const {
    updateGameJSON
  } = useRoomState();

  const {
    isLoadedGame: isGameDataLoaded,
    fetchGameData,
    checkIfUserIsBuilder
  } = useGameData(client, gameState);

  const {
    userProfileJSON,
    isBuilder,
    isAdmin,
    updateUserProfile
  } = useUserProfile(gameState, player);

  // Use the new centralized output management
  const {
    messages: gameOutputMessages,
    addErrorMessage,
    addSuccessMessage,
    addInfoMessage
  } = useGameOutput(gameState);

  // Debug logging - only log when values actually change
  useEffect(() => {
    console.log('[App Debug] GameState:', gameState);
  }, [gameState]);

  useEffect(() => {
    console.log('[App Debug] Player:', player);
  }, [player]);

  useEffect(() => {
    console.log('[App Debug] CurrentRoom:', currentRoom);
  }, [currentRoom]);

  useEffect(() => {
    console.log('[App Debug] IsLoginComplete:', isLoginComplete);
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
    
    console.log('[Command Debug] Parsed command:', command);
    
    switch (command.type) {
      case 'move':
        console.log('[Command Debug] Processing move command');
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
        
        const targetPermlink = currentRoomExits[direction];
        console.log('[Movement Debug] Found exit, moving to:', {
          direction,
          targetPermlink,
          currentAuthor: player?.location.author
        });
        
        // Use the gameState's move method
        gameState.move(direction);
        break;
      case 'say':
        console.log('[Command Debug] Processing say command');
        gameState.say(command.args[0]);
        break;
      case 'emote':
        console.log('[Command Debug] Processing emote command');
        gameState.emote(command.args[0]);
        break;
      case 'look':
        console.log('[Command Debug] Processing look command');
        gameState.look();
        break;
      case 'help':
        console.log('[Command Debug] Processing help command');
        gameState.help();
        break;
      case 'describe':
        console.log('[Command Debug] Processing describe command');
        gameState.setDescription(command.args[0]);
        break;
      case 'describeshort':
        console.log('[Command Debug] Processing describeshort command');
        gameState.setShortDescription(command.args[0]);
        break;
      case 'lookAt':
        console.log('[Command Debug] Processing lookAt command');
        const target = command.args[0];
        
        // Special case for "look self"
        if (target.toLowerCase() === 'self') {
          gameState.lookAtSelf();
          break;
        }
        
        console.log('[LookAt Debug] Target:', target);
        const currentRoom = gameState.getCurrentRoom();
        console.log('[LookAt Debug] Current room:', currentRoom);
        if (!currentRoom) {
          addErrorMessage('No current room found');
          break;
        }
        
        // Check if the detail exists in the room
        const roomDetails = (currentRoom as any).details || {};
        console.log('[LookAt Debug] Room details:', roomDetails);
        console.log('[LookAt Debug] Available detail keys:', Object.keys(roomDetails));
        
        // Try exact match first
        let detailKey = Object.keys(roomDetails).find(key => 
          key.toLowerCase() === target.toLowerCase()
        );
        console.log('[LookAt Debug] Exact match result:', detailKey);
        
        // If no exact match, try partial match
        if (!detailKey) {
          detailKey = Object.keys(roomDetails).find(key => 
            key.toLowerCase().includes(target.toLowerCase()) || 
            target.toLowerCase().includes(key.toLowerCase())
          );
          console.log('[LookAt Debug] Partial match result:', detailKey);
        }
        
        if (detailKey) {
          console.log('[LookAt Debug] Found detail, displaying:', detailKey, roomDetails[detailKey]);
          addInfoMessage(detailKey);
          addInfoMessage(roomDetails[detailKey]);
        } else {
          console.log('[LookAt Debug] No match found for:', target);
          addErrorMessage(`You don't see "${target}" here.`);
        }
        break;
      default:
        console.log('[Command Debug] Processing default case, command type:', command.type);
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
      console.log('[App Debug] connectionStatus:', connectionStatus);
    }
  }, [connectionStatus, isSignedIn]);

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
    if (player && player.location && isLoginComplete) {
      const last = lastConnectedRef.current;
      if (!last || last.username !== player.username || JSON.stringify(last.location) !== JSON.stringify(player.location)) {
        connect(player.username, player.location);
        lastConnectedRef.current = { username: player.username, location: player.location };
      }
    }
  }, [player, connect, isLoginComplete]);

  // Handle room changes - join corresponding chat channel
  useEffect(() => {
    if (player && currentRoom && isLoginComplete) {
      const currentChannelId = getCurrentChannelId();
      const newChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
      
      // Only join chat channel if we're not already in the correct channel and we're connected
      if (currentChannelId !== newChannelId && isConnected()) {
        if (currentChannelId) {
          leaveChatChannel(currentChannelId, player.username);
          // Reset channel state tracking when changing channels
          resetChannelStateTracking();
          
          // Join new channel immediately - no delay needed since signaling server issues are fixed
          joinChatChannel(newChannelId);
        } else {
          // No current channel, join immediately
          joinChatChannel(newChannelId);
        }
      }
    }
  }, [currentRoom, player, joinChatChannel, leaveChatChannel, getCurrentChannelId, resetChannelStateTracking, isConnected, isLoginComplete]);

  // Load game data on mount
  useEffect(() => {
    if (!isGameDataLoaded) {
      fetchGameData();
    }
  }, [fetchGameData, isGameDataLoaded]);

  // Sync game JSON when it's loaded
  useEffect(() => {
    if (gameState && isGameDataLoaded) {
      const gameMap = gameState.getHiveClient().getGameMap();
      updateGameJSON(gameMap);
    }
  }, [gameState, isGameDataLoaded, updateGameJSON]);

  // Listen for chat channel events to update present players
  useEffect(() => {
    if (!gameState) return;
    const handleChatChannelUpdate = (data: any) => {
      if (data && Array.isArray(data.players)) {
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
        .then(async (result) => {
          if (result.success) {
            setUsername(username);
            setIsSignedIn(true);
            
            // Check if user is admin account
            const isUserAdmin = username === config.game.account;
            const isUserBuilder = checkIfUserIsBuilder(username);
            
            // Update user profile and wait for builder state
            await updateUserProfile({ 
              egodeathplayer: { 
                Name: username 
              } 
            });
            
            // Login to game state
            addInfoMessage('Logging into game state...');
            login(username).then(() => {
              if (gameState) {
                // Set builder status after login
                gameState.setBuilderStatus(isUserBuilder);
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
  }, [keychain, checkIfUserIsBuilder, updateUserProfile, login, gameState, isBuilder, addErrorMessage, addInfoMessage, handleCommand]);

  const handleSignOut = useCallback(() => {
    setUsername(null);
    setIsSignedIn(false);
    updateUserProfile({});
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
          fetchGameData();
          if (username) {
            updateUserProfile({});
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