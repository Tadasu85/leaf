import React from 'react';
import { render, screen } from '@testing-library/react';
import GameOutputWindow from '../../components/GameOutputWindow';
import { SimpleMessage } from '../../hooks/useGameOutput';

describe('GameOutputWindow Component', () => {
  const mockMessages: SimpleMessage[] = [
    { id: '1', text: 'Welcome to the game!', bold: false },
    { id: '2', text: 'You are in a dark room.', bold: true },
    { id: '3', text: 'Exits: north, south', bold: false },
  ];

  it('renders without crashing', () => {
    render(<GameOutputWindow output={mockMessages} />);
    
    expect(screen.getByTestId('game-output')).toBeInTheDocument();
  });

  it('displays all messages correctly', () => {
    render(<GameOutputWindow output={mockMessages} />);
    
    expect(screen.getByText('Welcome to the game!')).toBeInTheDocument();
    expect(screen.getByText('You are in a dark room.')).toBeInTheDocument();
    expect(screen.getByText('Exits: north, south')).toBeInTheDocument();
  });

  it('applies bold styling to bold messages', () => {
    render(<GameOutputWindow output={mockMessages} />);
    
    const boldMessage = screen.getByText('You are in a dark room.');
    expect(boldMessage.closest('.game-output-window__message')).toHaveClass('game-output-window__message--bold');
  });

  it('handles empty output array', () => {
    render(<GameOutputWindow output={[]} />);
    
    expect(screen.getByTestId('game-output')).toBeInTheDocument();
    expect(screen.getByTestId('game-output')).toBeEmptyDOMElement();
  });

  it('handles messages with null or undefined text', () => {
    const messagesWithNulls: SimpleMessage[] = [
      { id: '1', text: 'Valid message', bold: false },
      { id: '2', text: null as any, bold: false },
      { id: '3', text: undefined as any, bold: false },
      { id: '4', text: 'Another valid message', bold: false },
    ];

    render(<GameOutputWindow output={messagesWithNulls} />);
    
    expect(screen.getByText('Valid message')).toBeInTheDocument();
    expect(screen.getByText('Another valid message')).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('splits multi-line messages correctly', () => {
    const multiLineMessages: SimpleMessage[] = [
      { id: '1', text: 'Line 1\nLine 2\nLine 3', bold: false },
    ];

    render(<GameOutputWindow output={multiLineMessages} />);
    
    // Since ReactMarkdown processes the text, we need to check for the content within the markdown div
    const markdownDiv = screen.getByTestId('react-markdown');
    expect(markdownDiv).toHaveTextContent('Line 1');
    expect(markdownDiv).toHaveTextContent('Line 2');
    expect(markdownDiv).toHaveTextContent('Line 3');
  });

  it('respects maxMessages limit', () => {
    const manyMessages: SimpleMessage[] = Array.from({ length: 150 }, (_, i) => ({
      id: `${i}`,
      text: `Message ${i}`,
      bold: false,
    }));

    render(<GameOutputWindow output={manyMessages} maxMessages={100} />);
    
    // Should only show the last 100 messages
    expect(screen.getByText('Message 50')).toBeInTheDocument();
    expect(screen.getByText('Message 149')).toBeInTheDocument();
    expect(screen.queryByText('Message 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Message 49')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<GameOutputWindow output={mockMessages} className="custom-class" />);
    
    const outputWindow = screen.getByTestId('game-output');
    expect(outputWindow).toHaveClass('game-output-window');
    expect(outputWindow).toHaveClass('custom-class');
  });

  it('handles messages with special characters', () => {
    const specialMessages: SimpleMessage[] = [
      { id: '1', text: 'Message with "quotes" and <brackets>', bold: false },
      { id: '2', text: 'Message with & symbols & more', bold: true },
    ];

    render(<GameOutputWindow output={specialMessages} />);
    
    expect(screen.getByText('Message with "quotes" and <brackets>')).toBeInTheDocument();
    expect(screen.getByText('Message with & symbols & more')).toBeInTheDocument();
  });

  it('creates unique keys for multi-line messages', () => {
    const multiLineMessage: SimpleMessage[] = [
      { id: 'test-1', text: 'First line\nSecond line', bold: false },
    ];

    render(<GameOutputWindow output={multiLineMessage} />);
    
    // Both lines should be rendered within the markdown div
    const markdownDiv = screen.getByTestId('react-markdown');
    expect(markdownDiv).toHaveTextContent('First line');
    expect(markdownDiv).toHaveTextContent('Second line');
  });

  it('handles very long messages', () => {
    const longMessage = 'a'.repeat(1000);
    const longMessages: SimpleMessage[] = [
      { id: '1', text: longMessage, bold: false },
    ];

    render(<GameOutputWindow output={longMessages} />);
    
    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });

  it('handles mixed message types', () => {
    const mixedMessages: SimpleMessage[] = [
      { id: '1', text: 'Regular message', bold: false },
      { id: '2', text: 'Bold message', bold: true },
      { id: '3', text: 'Multi-line\nmessage', bold: false },
      { id: '4', text: 'Another regular message', bold: false },
    ];

    render(<GameOutputWindow output={mixedMessages} />);
    
    expect(screen.getByText('Regular message')).toBeInTheDocument();
    expect(screen.getByText('Bold message')).toBeInTheDocument();
    expect(screen.getByText('Another regular message')).toBeInTheDocument();
    
    // Check that multi-line content is present
    const markdownDivs = screen.getAllByTestId('react-markdown');
    const multiLineDiv = markdownDivs[2]; // Third message
    expect(multiLineDiv).toHaveTextContent('Multi-line');
    expect(multiLineDiv).toHaveTextContent('message');
    
    // Check bold styling
    const boldMessage = screen.getByText('Bold message');
    expect(boldMessage.closest('.game-output-window__message')).toHaveClass('game-output-window__message--bold');
  });
}); 