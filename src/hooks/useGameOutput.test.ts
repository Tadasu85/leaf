import { renderHook, act } from '@testing-library/react';
import { useGameOutput } from './useGameOutput';
import { GameState } from '../game/state/GameState';

// Mock GameState
jest.mock('../game/state/GameState');

describe('useGameOutput', () => {
  let mockGameState: jest.Mocked<GameState>;

  beforeEach(() => {
    mockGameState = {
      on: jest.fn(),
      off: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with empty messages', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    expect(result.current.messages).toEqual([]);
  });

  it('should add a simple message', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addMessage('Test message');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Test message');
    expect(result.current.messages[0].bold).toBe(false);
  });

  it('should add a bold message', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addMessage('Bold message', true);
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Bold message');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('should add error message with prefix', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addErrorMessage('Something went wrong');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Error: Something went wrong');
  });

  it('should add success message with prefix', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addSuccessMessage('Operation completed');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Success: Operation completed');
  });

  it('should add info message without prefix', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addInfoMessage('Information message');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Information message');
  });

  it('should clear all messages', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });
    
    expect(result.current.messages).toHaveLength(2);
    
    act(() => {
      result.current.clearMessages();
    });
    
    expect(result.current.messages).toHaveLength(0);
  });

  it('should generate unique IDs for messages', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });
    
    expect(result.current.messages[0].id).not.toBe(result.current.messages[1].id);
  });

  it('should listen to GameState output events', () => {
    renderHook(() => useGameOutput(mockGameState));
    
    expect(mockGameState.on).toHaveBeenCalledWith('output', expect.any(Function));
  });

  it('should handle GameState output events', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    // Get the callback function that was registered
    const outputCallback = mockGameState.on.mock.calls[0][1];
    
    act(() => {
      outputCallback({ output: 'Game state message', bold: true });
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Game state message');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('should work without GameState', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('Message without GameState');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Message without GameState');
  });

  it('should handle multiple messages correctly', () => {
    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    act(() => {
      result.current.addMessage('First message');
      result.current.addErrorMessage('Error occurred');
      result.current.addSuccessMessage('Success!');
      result.current.addInfoMessage('Info message');
    });
    
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[0].text).toBe('First message');
    expect(result.current.messages[1].text).toBe('Error: Error occurred');
    expect(result.current.messages[2].text).toBe('Success: Success!');
    expect(result.current.messages[3].text).toBe('Info message');
  });
}); 