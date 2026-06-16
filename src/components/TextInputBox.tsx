import React, { useState, useRef, useEffect } from 'react';

interface TextInputBoxProps {
  onEnterPressed: (text: string) => void;
  isLoading?: boolean;
}

// Security constants (matching CommandParser)
const MAX_INPUT_LENGTH = 500;
const ALLOWED_CHARACTERS = /^[a-zA-Z0-9\s\-_.,!?'"@#$%&*()+=<>[\]{}|\\/:;]*$/;

const HISTORY_MAX = 25;

function TextInputBox({ onEnterPressed, isLoading = false }: TextInputBoxProps) {
  const [inputText, setInputText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isValid, setIsValid] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);
  const draft = useRef<string>('');

  // Focus the input when loading state changes from true to false
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const validateInput = (text: string): { isValid: boolean; error: string } => {
    // Check length
    if (text.length > MAX_INPUT_LENGTH) {
      return {
        isValid: false,
        error: `Input too long. Maximum ${MAX_INPUT_LENGTH} characters allowed.`
      };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /vbscript:/i,
      /expression\(/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) {
        return {
          isValid: false,
          error: 'Invalid characters detected.'
        };
      }
    }

    // Check for allowed characters only (but allow empty input)
    if (text.length > 0 && !ALLOWED_CHARACTERS.test(text)) {
      return {
        isValid: false,
        error: 'Contains invalid characters.'
      };
    }

    return { isValid: true, error: '' };
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (history.current.length === 0) return;
      if (historyIndex.current === -1) draft.current = inputText;
      const next = Math.min(historyIndex.current + 1, history.current.length - 1);
      historyIndex.current = next;
      const entry = history.current[history.current.length - 1 - next];
      setInputText(entry);
      setIsValid(true);
      setErrorMessage('');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex.current === -1) return;
      const next = historyIndex.current - 1;
      historyIndex.current = next;
      const entry = next === -1 ? draft.current : history.current[history.current.length - 1 - next];
      setInputText(entry);
      setIsValid(true);
      setErrorMessage('');
      return;
    }

    if (event.key === 'Enter' && !isLoading && isValid) {
      const text = inputText.trim();
      if (text) {
        history.current = [...history.current, text].slice(-HISTORY_MAX);
        historyIndex.current = -1;
        draft.current = '';
        onEnterPressed(text);
        setInputText('');
        setErrorMessage('');
        setIsValid(true);
      }
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    
    // Validate input
    const validation = validateInput(newValue);
    setIsValid(validation.isValid);
    setErrorMessage(validation.error);
    
    // Only update if valid or if clearing the input
    if (validation.isValid || newValue.length < inputText.length) {
      setInputText(newValue);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    // Prevent paste if it would exceed length limit
    const pastedText = event.clipboardData.getData('text');
    if (inputText.length + pastedText.length > MAX_INPUT_LENGTH) {
      event.preventDefault();
      setErrorMessage(`Pasted text too long. Maximum ${MAX_INPUT_LENGTH} characters allowed.`);
      return;
    }
  };

  const getInputClassName = () => {
    let className = 'text-input-box__input';
    if (!isValid) {
      className += ' text-input-box__input--error';
    }
    if (isLoading) {
      className += ' text-input-box__input--loading';
    }
    return className;
  };

  return (
    <div className="text-input-box">
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        onPaste={handlePaste}
        placeholder={isLoading ? "Processing..." : "Enter command"}
        autoFocus={true}
        data-testid="command-input"
        disabled={isLoading}
        className={getInputClassName()}
        maxLength={MAX_INPUT_LENGTH}
        aria-describedby={errorMessage ? "input-error" : undefined}
      />
      {errorMessage && (
        <div 
          id="input-error" 
          className="text-input-box__error"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </div>
      )}
      <div className="text-input-box__counter">
        {inputText.length}/{MAX_INPUT_LENGTH}
      </div>
    </div>
  );
}

export default TextInputBox;