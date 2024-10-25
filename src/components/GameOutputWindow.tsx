import React, { useRef, useEffect } from 'react';

export interface GameOutputMessage {
  // Define the type of each message in the output.
  // This could be a string or an object with more properties depending on your needs.
  output: any; // Replace with actual message type definition
}

interface GameOutputWindowProps {
  // Define the expected props for the component.
  output: GameOutputMessage[]; // Array of messages with the defined type.
}

function GameOutputWindow({ output }: GameOutputWindowProps) {
  const outputRef = useRef<HTMLDivElement>(null); // Correct type

  useEffect(() => {
  if (outputRef.current) {
    outputRef.current.scrollTo(0, outputRef.current.scrollHeight); // Type assertion
  }
}, [output]); // Dependency array includes output

  return (
    <div className="GameOutputWindow">
      {output.map((message: GameOutputMessage, index: number) => (
        <p key={index}>{message.output}</p> // Access the output property
      ))}
    </div>
  );
}

export default GameOutputWindow;