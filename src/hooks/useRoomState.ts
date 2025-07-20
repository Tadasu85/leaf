import { useReducer, useCallback, useRef } from 'react';
import { LegacyRoomData, GameJSON } from '../game/types/GameTypes';

// Room state reducer
type RoomStateAction = 
  | { type: 'SET_ROOM_DATA'; payload: LegacyRoomData }
  | { type: 'SET_GAME_JSON'; payload: GameJSON }
  | { type: 'SET_LOADED_GAME'; payload: boolean }
  | { type: 'UPDATE_ROOM_DATA'; payload: Partial<LegacyRoomData> }
  | { type: 'RESET_ROOM_STATE' };

interface RoomState {
  roomData: LegacyRoomData;
  gameJSON: GameJSON;
  isLoadedGame: boolean;
}

const initialRoomState: RoomState = {
  roomData: {
    body: '',
    title: '',
    players: [],
    details: {},
    exits: {},
    author: '',
    permlink: '',
  },
  gameJSON: {},
  isLoadedGame: false
};

function roomStateReducer(state: RoomState, action: RoomStateAction): RoomState {
  switch (action.type) {
    case 'SET_ROOM_DATA':
      return {
        ...state,
        roomData: {
          ...action.payload,
          exits: state.gameJSON[action.payload.permlink]?.exits || {}
        }
      };
    case 'SET_GAME_JSON':
      return {
        ...state,
        gameJSON: action.payload,
        roomData: {
          ...state.roomData,
          exits: action.payload[state.roomData.permlink]?.exits || {}
        }
      };
    case 'SET_LOADED_GAME':
      return {
        ...state,
        isLoadedGame: action.payload
      };
    case 'UPDATE_ROOM_DATA':
      return {
        ...state,
        roomData: {
          ...state.roomData,
          ...action.payload,
          exits: state.gameJSON[state.roomData.permlink]?.exits || {}
        }
      };
    case 'RESET_ROOM_STATE':
      return initialRoomState;
    default:
      return state;
  }
}

export function useRoomState() {
  const [state, dispatch] = useReducer(roomStateReducer, initialRoomState);
  
  // Use ref to access current state without causing re-renders
  const stateRef = useRef(state);
  stateRef.current = state;

  // Update room data
  const updateRoomData = useCallback((data: LegacyRoomData | ((prev: LegacyRoomData) => LegacyRoomData)) => {
    if (typeof data === 'function') {
      dispatch({ type: 'UPDATE_ROOM_DATA', payload: data(stateRef.current.roomData) });
    } else {
      dispatch({ type: 'SET_ROOM_DATA', payload: data });
    }
  }, []);

  // Update game JSON
  const updateGameJSON = useCallback((gameJSON: GameJSON) => {
    dispatch({ type: 'SET_GAME_JSON', payload: gameJSON });
  }, []);

  // Set loaded game status
  const setLoadedGame = useCallback((isLoaded: boolean) => {
    dispatch({ type: 'SET_LOADED_GAME', payload: isLoaded });
  }, []);

  // Check if room data has changed
  const hasRoomDataChanged = useCallback((newData: LegacyRoomData) => {
    return JSON.stringify(newData) !== JSON.stringify(stateRef.current.roomData);
  }, []);

  // Reset room state
  const resetRoomState = useCallback(() => {
    dispatch({ type: 'RESET_ROOM_STATE' });
  }, []);

  return {
    // State
    roomData: state.roomData,
    gameJSON: state.gameJSON,
    isLoadedGame: state.isLoadedGame,
    
    // Actions
    updateRoomData,
    updateGameJSON,
    setLoadedGame,
    hasRoomDataChanged,
    resetRoomState
  };
} 