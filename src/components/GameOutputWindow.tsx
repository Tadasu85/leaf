import React, { useRef, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
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
        
        // Convert single line breaks to double line breaks for Markdown rendering
        const processedText = message.text.replace(/\n/g, '\n\n');
        
        return (
          <div
            key={message.id}
            className={`game-output-window__message${message.bold ? ' game-output-window__message--bold' : ''}`}
          >
            <ReactMarkdown components={{
              a: ({node, children, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
              img: ({alt}) => <span>{alt}</span>
            }}>{processedText}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

export default GameOutputWindow;