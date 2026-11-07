import './App.css';
import GameOutputWindow from './components/GameOutputWindow';
import Header from './components/Header';
import TextInputBox from './components/TextInputBox';
import Sidebar from './components/Sidebar';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGameContext } from './contexts/GameContext';
import { useSocket } from './hooks/useSocket';
import { useModalState } from './hooks/useModalState';
import { useClients } from './hooks/useClients';
import { useGameOutput } from './hooks/useGameOutput';
import BuildModal from './components/BuildModal';
import QueueManagementModal from './components/QueueManagementModal';
import AddDetailModal from './components/AddDetailModal';

import EditRoomModal from './components/EditRoomModal';
import { KeychainKeyTypes } from 'keychain-sdk';
import config from './config';
import { MemoryMonitor } from './components/MemoryMonitor';
import { ServerStatusNotifier } from './components/ServerStatusNotifier';
import GameErrorBoundary from './components/GameErrorBoundary';
import ErrorBoundary from './components/ErrorBoundary';
import logger from './utils/Logger';
import { guestSession } from './game/guest/GuestSession';

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





function App() {
  // State
  const [username, setUsername] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [globalError, setGlobalError] = useState<{ message: string; details?: string } | null>(null);

  const { keychain } = useClients();

  // Use the new centralized game context
  const {
    gameState,
    player,
    currentRoom,
    login,
    loginAsGuest,
    isLoginComplete,
    isLoadedGame,
    userProfileJSON,
    isBuilder,
    isAdmin,
    updateUserProfile,
    updateGameJSON,
    buildApprovalQueue,
    handleCommand
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
    isAddDetailModalOpen,
    isEditRoomModalOpen,
    toggleBuildModal,
    toggleQueueModal,
    toggleAddDetailModal,
    toggleEditRoomModal
  } = useModalState();

  // Refs
  const hasShownGreeting = useRef(false);

  // Unified error handler - all errors go through this
  const handleGlobalError = useCallback((error: Error | string, details?: string) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    logger.error('Global error caught:', errorMessage, details);
    
    // Set global error state to trigger modal
    setGlobalError({
      message: errorMessage,
      details: details
    });
    
    // Also add to game output for logging
    addErrorMessage(errorMessage);
  }, [addErrorMessage]);

  // Set up global error handlers
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      handleGlobalError(
        error instanceof Error ? error : new Error(String(error)),
        'Unhandled promise rejection'
      );
      // Prevent the default browser behavior
      event.preventDefault();
    };

    const handleGlobalErrorEvent = (event: ErrorEvent) => {
      handleGlobalError(
        event.error || new Error(event.message),
        'Global error event'
      );
    };



    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalErrorEvent);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalErrorEvent);
    };
  }, [handleGlobalError]);
  const lastConnectedRef = useRef<{ username: string; location: any } | null>(null);

  // Constants
  const gameGreeting = useMemo(() => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                          (window.innerWidth <= 768 && window.innerHeight <= 1024);
    
    const baseGreeting = [
      "If you've arrived here by accident and do not have a Hive account. ",
      `Please make your way to [ecency.com/signup](https://ecency.com/signup/free?referral=${config.game.account}) or [hivedapps.com](https://hivedapps.com/) to create an account.`,
      "Otherwise you may proceed by typing 'login <username>', 'connect <username>', or just '<username>'",
      "No account yet? Type 'guest' to look around and chat as a guest."
    ];
    
    if (isMobileDevice) {
      return [
        ...baseGreeting,
        "You will need the [Hive Keychain](https://hive-keychain.com/) app installed on your mobile device and your account added.",
        "If this is successful you will see your username in the top right."
      ];
    } else {
      return [
        ...baseGreeting,
        "You will also need the [Hive Keychain](https://hive-keychain.com/) extension installed and your account added.",
        "If this is successful you will see your username in the top right."
      ];
    }
  }, []);

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
    // Admin users don't have a location, so they don't need to connect to a specific room
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
      logger.debug('[App] Not ready to join room:', {
        hasPlayer: !!player,
        hasCurrentRoom: !!currentRoom,
        isLoginComplete,
        isConnected: isConnected
      });
      return;
    }

    // Skip if socket is not connected yet - let the connection effect handle it
    if (!isConnected) {
      logger.debug('[App] Socket not connected yet, waiting for connection');
      return;
    }

    const currentChannelId = getCurrentChannelId();
    const newChannelId = `${currentRoom.author}/${currentRoom.permlink}`;
    
    logger.debug('[App] Room change effect triggered:', { 
      player: player.username, 
      currentRoom: newChannelId,
      isLoginComplete,
      isConnected: isConnected,
      currentChannelId
    });
    
    // Only join chat channel if we're not already in the correct channel
    if (currentChannelId !== newChannelId) {
      logger.debug('[App] Joining new channel:', newChannelId);
      if (currentChannelId) {
        // Leave current chat channel
        logger.debug('[App] Leaving current channel:', currentChannelId);
        leaveChatChannel(currentChannelId, player.username);
        resetChannelStateTracking();
      }
      // Join new channel immediately
      joinChatChannel(newChannelId);
    } else {
      logger.debug('[App] Already in correct channel:', newChannelId);
    }
  }, [currentRoom?.author, currentRoom?.permlink, player?.username, isLoginComplete, isConnected, joinChatChannel, leaveChatChannel, getCurrentChannelId, resetChannelStateTracking, currentRoom, player]);

  // Handle initial room join when socket connects
  useEffect(() => {
    logger.debug('[App] Socket connection effect triggered:', {
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
        logger.debug('[App] Socket connected, joining initial room:', newChannelId);
        joinChatChannel(newChannelId);
      } else {
        logger.debug('[App] Already in correct channel, not joining:', newChannelId);
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



  // Cleanup on app unmount
  useEffect(() => {
    return () => {
      logger.debug('[App] Cleaning up on unmount');
      if (gameState && typeof gameState.destroy === 'function') {
        gameState.destroy();
      }
    };
  }, [gameState]);

  const handleTextEnteredWrapper = useCallback(async (text: string) => {
    if (!isSignedIn && /^guest$/i.test(text.trim())) {
      addInfoMessage('Starting a guest session...');
      try {
        const identity = await guestSession.start();
        setUsername(identity.username);
        setIsSignedIn(true);
        await loginAsGuest(identity);
        addInfoMessage(
          `You are ${identity.username}, a guest. You can explore and chat; your place is saved in this browser. ` +
          'Building, descriptions and curation need a Hive account.'
        );
        if (!identity.sessionToken) {
          addInfoMessage('Chat is not available right now, but you can still look around.');
        }
      } catch (error) {
        handleGlobalError(error instanceof Error ? error : String(error), 'Guest login failed');
        setIsSignedIn(false);
        setUsername(null);
      }
      return;
    }
    const keyword = !isSignedIn && text.match(/^(login|connect)(\s+\S+)?$/i);
    if (keyword && !keyword[2]) {
      addErrorMessage(`Please provide a username: ${keyword[1].toLowerCase()} <username>`);
      return;
    }
    const loginMatch = !isSignedIn && (
      text.match(/^login\s+(\S+)$/i) ||
      text.match(/^connect\s+(\S+)$/i) ||
      text.match(/^(\S+)$/)
    );
    if (loginMatch) {
      const username = loginMatch[1];
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
              handleGlobalError(error, 'Game login failed');
              // Reset login state if game login fails
              setIsSignedIn(false);
              setUsername(null);
            });
          } else {
            // Keychain login failed
            logger.debug('Keychain login failed result:', result);
            
            // Handle mobile-specific errors
            if (result.error === 'mobile_keychain_required' || result.error === 'mobile_app_redirect') {
              // Mobile-specific error handling
              const errorMessage = result.message || 'Mobile keychain app required';
              let errorDetails = 'Mobile platform detected. ';
              
              if (result.data?.requiresApp) {
                errorDetails += 'Please install the Hive Keychain app from your device\'s app store and add your account.';
              }
              
              if (result.data?.instructions) {
                errorDetails += `\n\nInstructions: ${result.data.instructions}`;
              }
              
              // For mobile app redirect, show as info rather than error
              if (result.error === 'mobile_app_redirect') {
                addInfoMessage(errorMessage);
                if (result.data?.instructions) {
                  addInfoMessage(result.data.instructions);
                }
              } else {
                handleGlobalError(errorMessage, errorDetails);
              }
            } else {
              // Standard desktop error handling
              const errorMessage = result.message || result.error || 'Keychain login failed. Please check your Keychain extension.';
              
              const errorDetails = {
                error: result.error,
                message: result.message,
                data: result.data,
                request_id: result.request_id,
                fullResult: result
              };
              
              handleGlobalError(errorMessage, `Keychain login details:\n${JSON.stringify(errorDetails, null, 2)}`);
            }
          }
        })
        .catch((error) => {
          // Extract detailed error information from keychain error
          logger.debug('Keychain login catch error:', error);
          let errorMessage = 'Login error';
          let errorDetails = 'Unknown error';
          
          if (error && typeof error === 'object') {
            errorMessage = error.message || error.error || error.toString();
            
            // For user_cancel errors, provide more specific error messages
            if (error.error === 'user_cancel' && error.data && error.data.username) {
              const username = error.data.username;
              errorMessage = `Account @${username} has not been added to the Hive Keychain wallet. Please add this account to your Keychain extension first.`;
            } else if (error.error === 'user_cancel') {
              errorMessage = 'Login was canceled. This usually means the account was not found in your Hive Keychain wallet or there was an issue with the login request.';
            }
            
            // Build detailed error information for catch errors
            const detailedError = {
              error: error.error,
              message: error.message,
              data: error.data,
              request_id: error.request_id,
              stack: error.stack,
              fullError: error
            };
            
            errorDetails = `Catch error details:\n${JSON.stringify(detailedError, null, 2)}`;
          } else if (typeof error === 'string') {
            errorMessage = error;
            errorDetails = 'String error';
          }
          
          handleGlobalError(errorMessage, errorDetails);
        });
    } else {
      // Handle other commands
      try {
        await handleCommand(text);
      } catch (error) {
        handleGlobalError(error instanceof Error ? error : new Error(String(error)), 'Command failed');
      }
    }
  }, [keychain, updateUserProfile, login, loginAsGuest, gameState, isBuilder, isSignedIn, addErrorMessage, addInfoMessage, handleCommand, handleGlobalError]);

  const handleSignOut = useCallback(() => {
    setUsername(null);
    setIsSignedIn(false);
    updateUserProfile(null);
    addInfoMessage('You have been signed out.');
  }, [updateUserProfile, addInfoMessage]);

  // Visual logging for mobile debugging
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Memoize the addToDebugLogs function to prevent infinite loops
  const addToDebugLogs = useCallback((level: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    
    setDebugLogs(prev => {
      const newLogs = [...prev, logEntry];
      // Keep only last 50 logs to prevent memory issues
      return newLogs.slice(-50);
    });
  }, []);

  // Override console.log for mobile debugging (development only)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const originalLog = console.log;
    const originalDebug = console.debug;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog(...args);
      addToDebugLogs('LOG', ...args);
    };

    console.debug = (...args) => {
      originalDebug(...args);
      addToDebugLogs('DEBUG', ...args);
    };

    console.info = (...args) => {
      originalInfo(...args);
      addToDebugLogs('INFO', ...args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      addToDebugLogs('WARN', ...args);
    };

    console.error = (...args) => {
      originalError(...args);
      addToDebugLogs('ERROR', ...args);
    };

    // Cleanup function
    return () => {
      console.log = originalLog;
      console.debug = originalDebug;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, [addToDebugLogs]);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        handleGlobalError(error, `Application error: ${errorInfo?.componentStack || 'Unknown component'}`);
      }}
    >
      <div className="app">
        <Header
          isSignedIn={isSignedIn}
          username={username}
          userProfileJSON={userProfileJSON}
          onSignOut={handleSignOut}
        />
        
        {/* Debug Logs Toggle Button - mobile, development builds only (logs are only captured in development) */}
        {process.env.NODE_ENV === 'development' &&
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && (
          <button
            onClick={() => setShowDebugLogs(!showDebugLogs)}
            style={{
              position: 'fixed',
              top: '10px',
              right: '10px',
              zIndex: 1000,
              padding: '5px 10px',
              backgroundColor: showDebugLogs ? '#ff4444' : '#4444ff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {showDebugLogs ? 'Hide' : 'Show'} Debug Logs
          </button>
        )}
        
        {/* Debug Logs Panel */}
        {showDebugLogs && (
          <div
            style={{
              position: 'fixed',
              top: '50px',
              right: '10px',
              width: '300px',
              maxHeight: '400px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              color: '#00ff00',
              padding: '10px',
              borderRadius: '5px',
              fontSize: '10px',
              fontFamily: 'monospace',
              overflowY: 'auto',
              zIndex: 999,
              border: '1px solid #00ff00'
            }}
          >
            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
              Debug Logs ({debugLogs.length})
              <button
                onClick={() => setDebugLogs([])}
                style={{
                  float: 'right',
                  backgroundColor: '#ff4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            </div>
            {debugLogs.map((log, index) => (
              <div key={index} style={{ marginBottom: '2px', wordBreak: 'break-all' }}>
                {log}
              </div>
            ))}
          </div>
        )}
      {(isBuilder || isAdmin) && (
        <Sidebar
          isSignedIn={isSignedIn}
          isBuilder={isBuilder}
          isAdmin={isAdmin}
          username={username}
          currentRoomAuthor={currentRoom?.author || null}
          isBuildModalOpen={isBuildModalOpen}
          isQueueModalOpen={isQueueModalOpen}
          isAddDetailModalOpen={isAddDetailModalOpen}
          isEditRoomModalOpen={isEditRoomModalOpen}
          onToggleBuildModal={toggleBuildModal}
          onToggleQueueModal={toggleQueueModal}
          onToggleAddDetailModal={toggleAddDetailModal}
          onToggleEditRoomModal={toggleEditRoomModal}
        />
      )}
      {!isAdmin && (
        <GameErrorBoundary
          onError={(error, errorInfo) => {
            handleGlobalError(error, `Game component error: ${errorInfo?.componentStack || 'Unknown component'}`);
          }}
          onRecover={() => {
            addInfoMessage('Game components recovered successfully.');
          }}
        >
          <GameOutputWindow 
            output={gameOutputMessages} 
            maxMessages={200}
          />
          <div className="text-input-box">
            <TextInputBox onEnterPressed={handleTextEnteredWrapper} />
          </div>
        </GameErrorBoundary>
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
          onError={(error) => {
            handleGlobalError(error, 'Room creation error');
          }}
        />
        <QueueManagementModal
          isOpen={isQueueModalOpen}
          onClose={toggleQueueModal}
          username={username}
          buildApprovalQueue={buildApprovalQueue}
          onError={(error) => {
            handleGlobalError(error, 'Queue management error');
          }}
        />
        <AddDetailModal
          isOpen={isAddDetailModalOpen}
          onClose={toggleAddDetailModal}
          username={username}
          currentRoom={currentRoom ? {
            author: currentRoom.author,
            permlink: currentRoom.permlink
          } : null}
          onDetailAdded={() => {
            addSuccessMessage('Detail added successfully!');
            // Refresh the room to show the new detail
            if (gameState && currentRoom) {
              gameState.loadRoom(currentRoom);
            }
          }}
          onError={(error) => {
            handleGlobalError(error, 'Add detail error');
          }}
        />

                 <EditRoomModal
           isOpen={isEditRoomModalOpen}
           onClose={toggleEditRoomModal}
           username={username}
           currentRoom={currentRoom ? {
             author: currentRoom.author,
             permlink: currentRoom.permlink,
             title: currentRoom.title,
             description: currentRoom.description,
             exits: Object.keys(currentRoom.exits || {}),
             exitMessages: currentRoom.exitMessages || {}
           } : null}
           onRoomUpdated={() => {
             addSuccessMessage('Room updated successfully!');
             // Refetch the room once Hive has included the edit (about one block)
             if (gameState && currentRoom) {
               const location = { author: currentRoom.author, permlink: currentRoom.permlink };
               setTimeout(() => { gameState.reloadRoom(location); }, 4000);
             }
           }}
           onError={(error) => {
             handleGlobalError(error, 'Room editing error');
           }}
         />
      <ServerStatusNotifier connectionStatus={connectionStatus} isSignedIn={isSignedIn} />
      <MemoryMonitor
        hiveClient={gameState?.getHiveClient() || null}
        isVisible={process.env.NODE_ENV === 'development'}
      />
      
      {/* Global Error Modal */}
      {globalError && (
        <div className="modal__overlay" style={{ zIndex: 9999 }}>
          <div className="modal__content" style={{ maxWidth: '500px' }}>
            <div className="modal__header">
              <h2>⚠️ Error</h2>
              <button 
                className="modal__close-button" 
                onClick={() => setGlobalError(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal__body">
              <p style={{ marginBottom: '1rem' }}>{globalError.message}</p>
              {globalError.details && process.env.NODE_ENV === 'development' && (
                <details style={{ marginTop: '1rem' }}>
                  <summary>Error Details (Development)</summary>
                  <pre style={{ 
                    backgroundColor: '#f5f5f5', 
                    padding: '0.5rem', 
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    overflow: 'auto',
                    maxHeight: '200px'
                  }}>
                    {globalError.details}
                  </pre>
                </details>
              )}
            </div>
            <div className="modal__form-actions">
              <button 
                className="modal__submit-button"
                onClick={() => setGlobalError(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
}

export default App;