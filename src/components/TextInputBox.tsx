import { useState } from 'react';

interface TextInputBoxProps {
  onEnterPressed: (value: string) => void;
}

export default function TextInputBox({ onEnterPressed }: TextInputBoxProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (event: React.KeyboardEvent<EventTarget>) => {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    // Capture the input value and call the provided callback
    setInputValue(event.target.value); // Now `event.target` is narrowed to HTMLInputElement
    onEnterPressed(event.target.value); // Assuming onEnterPressed handles string
    setInputValue('');
  }
};

  return (
    <input
      type="text"
      value={inputValue}
      onChange={(event) => setInputValue(event.target.value)}
      onKeyDown={handleKeyDown}
      autoFocus
    />
  );
}