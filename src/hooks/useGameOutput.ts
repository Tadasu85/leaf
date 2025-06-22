import { useState, useCallback, useEffect } from 'react';
import { GameOutputMessage } from '../game/types/GameTypes';
import { GameState } from '../game/state/GameState';

export interface SimpleMessage {
  id: string;
  text: string;
  bold?: boolean;
}

export function useGameOutput(gameState: GameState | null) {
  const [messages, setMessages] = useState<SimpleMessage[]>([]);

  // Add a simple message
  const addMessage = useCallback((text: string, bold: boolean = false) => {
    const message: SimpleMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      text,
      bold
    };
    setMessages(prev => [...prev, message]);
  }, []);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Convenience methods for different message types (simplified)
  const addSystemMessage = useCallback((text: string, bold: boolean = false) => {
    addMessage(text, bold);
  }, [addMessage]);

  const addErrorMessage = useCallback((text: string, bold: boolean = false) => {
    addMessage(`Error: ${text}`, bold);
  }, [addMessage]);

  const addSuccessMessage = useCallback((text: string, bold: boolean = false) => {
    addMessage(`Success: ${text}`, bold);
  }, [addMessage]);

  const addInfoMessage = useCallback((text: string, bold: boolean = false) => {
    addMessage(text, bold);
  }, [addMessage]);

  // Listen to GameState output events
  useEffect(() => {
    if (!gameState) return;

    const handleOutput = (message: GameOutputMessage) => {
      addMessage(message.output, message.bold);
    };

    gameState.on('output', handleOutput);

    return () => {
      gameState.off('output', handleOutput);
    };
  }, [gameState, addMessage]);

  return {
    messages,
    addMessage,
    addSystemMessage,
    addErrorMessage,
    addSuccessMessage,
    addInfoMessage,
    clearMessages
  };
} 