import React, { useRef, useLayoutEffect } from 'react';
import { SimpleMessage } from '../hooks/useGameOutput';

interface GameOutputWindowProps {
  output: SimpleMessage[];
  className?: string;
  maxMessages?: number;
}

function GameOutputWindow({ 
  output = [], 
  className = '',
  maxMessages = 100
}: GameOutputWindowProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (outputRef.current) {
      try {
        outputRef.current.scrollTo(0, outputRef.current.scrollHeight);
      } catch (e) {
        if (outputRef.current.scrollTop !== undefined) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      }
    }
  }, [output]);

  // Limit messages to prevent performance issues
  const displayMessages = output.slice(-maxMessages);

  return (
    <div className={`game-output-window ${className}`} ref={outputRef} data-testid="game-output">
      {displayMessages.map((message: SimpleMessage) => {
        if (!message || !message.text) return null;
        
        const lines = message.text.split('\n');
        return lines.map((line, lineIndex) => (
          <div key={`${message.id}-${lineIndex}`} className={`game-output-window__message${message.bold ? ' game-output-window__message--bold' : ''}`}>
            {line}
          </div>
        ));
      })}
    </div>
  );
}

export default GameOutputWindow;