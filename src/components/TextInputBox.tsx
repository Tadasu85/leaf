import React, { useState, useRef, useEffect } from 'react';

interface TextInputBoxProps {
  onEnterPressed: (text: string) => void;
  isLoading?: boolean;
}

function TextInputBox({ onEnterPressed, isLoading = false }: TextInputBoxProps) {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when loading state changes from true to false
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      console.log('[TextInputBox Debug] Enter pressed, calling onEnterPressed with:', inputText);
      onEnterPressed(inputText);
      setInputText('');
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value);
  };

  return (
    <div className="TextInputBox">
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? "Processing..." : "Enter command"}
        autoFocus={true}
        data-testid="command-input"
        disabled={isLoading}
      />
    </div>
  );
}

export default TextInputBox;