import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TextInputBox from './TextInputBox';

describe('TextInputBox', () => {
  const mockOnEnterPressed = jest.fn();

  beforeEach(() => {
    mockOnEnterPressed.mockClear();
  });

  it('should render with default props', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const input = screen.getByTestId('command-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Enter command');
    expect(input).not.toBeDisabled();
  });

  it('should handle text input changes', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const input = screen.getByTestId('command-input');
    fireEvent.change(input, { target: { value: 'test command' } });
    
    expect(input).toHaveValue('test command');
  });

  it('should call onEnterPressed when Enter is pressed', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const input = screen.getByTestId('command-input');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockOnEnterPressed).toHaveBeenCalledWith('test command');
  });

  it('should clear input after Enter is pressed', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const input = screen.getByTestId('command-input');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(input).toHaveValue('');
  });

  it('should not call onEnterPressed when Enter is pressed during loading', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} isLoading={true} />);
    
    const input = screen.getByTestId('command-input');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(mockOnEnterPressed).not.toHaveBeenCalled();
  });

  it('should show loading state correctly', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} isLoading={true} />);
    
    const input = screen.getByTestId('command-input');
    expect(input).toHaveAttribute('placeholder', 'Processing...');
    expect(input).toBeDisabled();
  });

  it('should not call onEnterPressed for other keys', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const input = screen.getByTestId('command-input');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyDown(input, { key: 'Space' });
    
    expect(mockOnEnterPressed).not.toHaveBeenCalled();
  });

  it('should have correct attributes', () => {
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const input = screen.getByTestId('command-input');
    expect(input).toHaveAttribute('type', 'text');
  });
}); 