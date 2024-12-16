import { useRef, useLayoutEffect } from 'react';

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
    outputRef.current.scrollTo(0, outputRef.current.scrollHeight); // Scroll on every output change
  }
}, [output]); // Dependency array includes output

  return (
    <div className="GameOutputWindow" ref={outputRef}>
    {output.map((message: GameOutputMessage, index: number) => (
      <p key={index}>
      {message.bold ? (
        <b>{message.output}</b>
        ) : (
        <span>{message.output}</span>
        )}
        </p>
        ))}
    </div>
    );
}

export default GameOutputWindow;