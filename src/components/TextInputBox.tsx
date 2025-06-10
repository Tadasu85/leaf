import React, { useState } from 'react';

interface TextInputBoxProps {
  onEnterPressed: (text: string) => void;
  isLoading?: boolean;
}

function TextInputBox({ onEnterPressed, isLoading = false }: TextInputBoxProps) {
  const [inputText, setInputText] = useState('');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
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