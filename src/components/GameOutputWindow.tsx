import React, { useRef, useLayoutEffect } from 'react';

export interface GameOutputMessage {
  // Define the type of each message in the output.
  // This could be a string or an object with more properties depending on your needs.
  output: string; // Replace with actual message type definition
  bold?: boolean;
}

interface GameOutputWindowProps {
  // Define the expected props for the component.
  output: GameOutputMessage[]; // Array of messages with the defined type.
}

function GameOutputWindow({ output }: GameOutputWindowProps) {
  const outputRef = useRef<HTMLDivElement>(null); // Correct type

  useLayoutEffect(() => {
    if (outputRef.current) {
      try {
        // Try to use scrollTo if available
        outputRef.current.scrollTo(0, outputRef.current.scrollHeight);
      } catch (e) {
        // Fallback for environments where scrollTo is not available (like jsdom in tests)
        if (outputRef.current.scrollTop !== undefined) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      }
    }
  }, [output]); // Dependency array includes output

  return (
    <div className="GameOutputWindow" ref={outputRef} data-testid="game-output">
      {output.map((message: GameOutputMessage, index: number) => {
        const lines = message.output.split('\n');
        return lines.map((line, lineIndex) => (
          <p key={`${index}-${lineIndex}`}>
            {message.bold ? (
              <b>{line}</b>
            ) : (
              <span>{line}</span>
            )}
          </p>
        ));
      })}
    </div>
  );
}

export default GameOutputWindow;