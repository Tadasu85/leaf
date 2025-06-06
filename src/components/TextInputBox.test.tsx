import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TextInputBox from './TextInputBox';

describe('TextInputBox', () => {
  test('renders input element', () => {
    const mockOnEnterPressed = jest.fn();
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const inputElement = screen.getByTestId('command-input');
    expect(inputElement).toBeInTheDocument();
  });

  test('updates input value when typing', () => {
    const mockOnEnterPressed = jest.fn();
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const inputElement = screen.getByTestId('command-input');
    fireEvent.change(inputElement, { target: { value: 'test input' } });
    
    expect(inputElement).toHaveValue('test input');
  });

  test('calls onEnterPressed and clears input when Enter is pressed', () => {
    const mockOnEnterPressed = jest.fn();
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const inputElement = screen.getByTestId('command-input');
    fireEvent.change(inputElement, { target: { value: 'test input' } });
    fireEvent.keyDown(inputElement, { key: 'Enter' });
    
    expect(mockOnEnterPressed).toHaveBeenCalledWith('test input');
    expect(inputElement).toHaveValue('');
  });

  test('does not call onEnterPressed when other keys are pressed', () => {
    const mockOnEnterPressed = jest.fn();
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const inputElement = screen.getByTestId('command-input');
    fireEvent.change(inputElement, { target: { value: 'test input' } });
    fireEvent.keyDown(inputElement, { key: 'Space' });
    
    expect(mockOnEnterPressed).not.toHaveBeenCalled();
    expect(inputElement).toHaveValue('test input');
  });

  test('has autofocus and placeholder', () => {
    const mockOnEnterPressed = jest.fn();
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const inputElement = screen.getByTestId('command-input');
    expect(document.activeElement).toBe(inputElement);
    expect(inputElement).toHaveAttribute('placeholder', 'Enter command');
  });

  test('handles invalid input gracefully', () => {
    const mockOnEnterPressed = jest.fn();
    render(<TextInputBox onEnterPressed={mockOnEnterPressed} />);
    
    const inputElement = screen.getByTestId('command-input');
    // @ts-ignore - Testing invalid input
    fireEvent.change(inputElement, { target: { value: null } });
    
    expect(inputElement).toHaveValue('');
  });
}); 