import { renderHook, act } from '@testing-library/react';
import { useGameOutput } from '../../hooks/useGameOutput';
import { GameState } from '../../game/state/GameState';

// Mock GameState
jest.mock('../../game/state/GameState');

describe('useGameOutput Hook', () => {
  let mockGameState: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGameState = {
      on: jest.fn(),
      off: jest.fn(),
    };
  });

  it('initializes with empty messages array', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    expect(result.current.messages).toEqual([]);
  });

  it('adds a simple message correctly', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('Test message');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Test message');
    expect(result.current.messages[0].bold).toBe(false);
    expect(result.current.messages[0].id).toMatch(/^msg_\d+_\d+\.\d+$/);
  });

  it('adds a bold message correctly', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('Bold message', true);
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Bold message');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('adds multiple messages correctly', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('First message');
      result.current.addMessage('Second message');
      result.current.addMessage('Third message');
    });
    
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0].text).toBe('First message');
    expect(result.current.messages[1].text).toBe('Second message');
    expect(result.current.messages[2].text).toBe('Third message');
  });

  it('clears all messages', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('First message');
      result.current.addMessage('Second message');
    });
    
    expect(result.current.messages).toHaveLength(2);
    
    act(() => {
      result.current.clearMessages();
    });
    
    expect(result.current.messages).toEqual([]);
  });

  it('adds system message correctly', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addSystemMessage('System message');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('System message');
    expect(result.current.messages[0].bold).toBe(false);
  });

  it('adds error message with prefix', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addErrorMessage('Something went wrong');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Error: Something went wrong');
    expect(result.current.messages[0].bold).toBe(false);
  });

  it('adds error message with bold formatting', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addErrorMessage('Critical error', true);
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Error: Critical error');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('adds success message with prefix', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addSuccessMessage('Operation completed');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Success: Operation completed');
    expect(result.current.messages[0].bold).toBe(false);
  });

  it('adds success message with bold formatting', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addSuccessMessage('Great success!', true);
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Success: Great success!');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('adds info message correctly', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addInfoMessage('Information message');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Information message');
    expect(result.current.messages[0].bold).toBe(false);
  });

  it('adds info message with bold formatting', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addInfoMessage('Important info', true);
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Important info');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('generates unique IDs for messages', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('First message');
      result.current.addMessage('Second message');
    });
    
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).not.toBe(result.current.messages[1].id);
    expect(result.current.messages[0].id).toMatch(/^msg_\d+_\d+\.\d+$/);
    expect(result.current.messages[1].id).toMatch(/^msg_\d+_\d+\.\d+$/);
  });

  it('listens to GameState output events when gameState is provided', () => {
    const mockHandleOutput = jest.fn();
    mockGameState.on.mockImplementation((event: string, handler: (...args: any[]) => any) => {
      if (event === 'output') {
        mockHandleOutput.mockImplementation(handler);
      }
    });

    renderHook(() => useGameOutput(mockGameState));
    
    expect(mockGameState.on).toHaveBeenCalledWith('output', expect.any(Function));
  });

  it('does not listen to GameState events when gameState is null', () => {
    renderHook(() => useGameOutput(null));
    
    expect(mockGameState.on).not.toHaveBeenCalled();
  });

  it('handles GameState output events correctly', () => {
    const mockHandleOutput = jest.fn();
    mockGameState.on.mockImplementation((event: string, handler: (...args: any[]) => any) => {
      if (event === 'output') {
        mockHandleOutput.mockImplementation(handler);
      }
    });

    const { result } = renderHook(() => useGameOutput(mockGameState));
    
    // Simulate a GameState output event
    act(() => {
      mockHandleOutput({ output: 'Game state message', bold: true });
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Game state message');
    expect(result.current.messages[0].bold).toBe(true);
  });

  it('cleans up GameState event listeners on unmount', () => {
    const { unmount } = renderHook(() => useGameOutput(mockGameState));
    
    expect(mockGameState.on).toHaveBeenCalledWith('output', expect.any(Function));
    
    unmount();
    
    expect(mockGameState.off).toHaveBeenCalledWith('output', expect.any(Function));
  });

  it('maintains message order when adding multiple messages rapidly', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('First');
      result.current.addMessage('Second');
      result.current.addMessage('Third');
    });
    
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0].text).toBe('First');
    expect(result.current.messages[1].text).toBe('Second');
    expect(result.current.messages[2].text).toBe('Third');
  });

  it('handles empty string messages', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('');
  });

  it('handles special characters in messages', () => {
    const { result } = renderHook(() => useGameOutput(null));
    
    act(() => {
      result.current.addMessage('Message with "quotes" and <brackets>');
    });
    
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('Message with "quotes" and <brackets>');
  });
}); 