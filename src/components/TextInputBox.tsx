import React, { useState } from 'react';

interface TextInputBoxProps {
  onEnterPressed: (text: string) => void;
}

function TextInputBox({ onEnterPressed }: TextInputBoxProps) {
  const [inputText, setInputText] = useState('');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
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
        placeholder="Enter command"
        autoFocus={true}
        data-testid="command-input"
      />
    </div>
  );
}

export default TextInputBox;