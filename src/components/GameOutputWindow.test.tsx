import React from 'react';
import { render, screen } from '@testing-library/react';
import GameOutputWindow from './GameOutputWindow';
import { SimpleMessage } from '../hooks/useGameOutput';

// Mock scrollTo and scrollTop
const mockScrollTo = jest.fn();
const mockScrollTop = jest.fn();

Object.defineProperty(window.HTMLDivElement.prototype, 'scrollTo', {
  value: mockScrollTo,
  writable: true
});

Object.defineProperty(window.HTMLDivElement.prototype, 'scrollTop', {
  get: mockScrollTop,
  set: jest.fn()
});

describe('GameOutputWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScrollTo.mockImplementation(() => {});
    mockScrollTop.mockReturnValue(0);
  });

  it('should render with empty output', () => {
    render(<GameOutputWindow output={[]} />);
    
    const outputWindow = screen.getByTestId('game-output');
    expect(outputWindow).toBeInTheDocument();
    expect(outputWindow.children).toHaveLength(0);
  });

  it('should render a single message', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Test message', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('should render a bold message', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Bold message', bold: true }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    const messageElement = screen.getByText('Bold message');
    expect(messageElement).toBeInTheDocument();
    expect(messageElement).toHaveClass('output-message--bold');
  });

  it('should render multiple messages', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'First message', bold: false },
      { id: '2', text: 'Second message', bold: true },
      { id: '3', text: 'Third message', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
    expect(screen.getByText('Third message')).toBeInTheDocument();
  });

  it('should handle messages with newlines', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Line 1\nLine 2\nLine 3', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
    expect(screen.getByText('Line 3')).toBeInTheDocument();
  });

  it('should limit messages to maxMessages', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Message 1', bold: false },
      { id: '2', text: 'Message 2', bold: false },
      { id: '3', text: 'Message 3', bold: false },
      { id: '4', text: 'Message 4', bold: false },
      { id: '5', text: 'Message 5', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} maxMessages={3} />);
    
    // Should only show the last 3 messages
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Message 2')).not.toBeInTheDocument();
    expect(screen.getByText('Message 3')).toBeInTheDocument();
    expect(screen.getByText('Message 4')).toBeInTheDocument();
    expect(screen.getByText('Message 5')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Test message', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} className="custom-class" />);
    
    const outputWindow = screen.getByTestId('game-output');
    expect(outputWindow).toHaveClass('GameOutputWindow', 'custom-class');
  });

  it('should skip empty messages', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Valid message', bold: false },
      { id: '2', text: '', bold: false },
      { id: '3', text: 'Another valid message', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    expect(screen.getByText('Valid message')).toBeInTheDocument();
    expect(screen.getByText('Another valid message')).toBeInTheDocument();
  });

  it('should skip messages without text', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Valid message', bold: false },
      { id: '2', text: undefined as any, bold: false },
      { id: '3', text: 'Another valid message', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    expect(screen.getByText('Valid message')).toBeInTheDocument();
    expect(screen.getByText('Another valid message')).toBeInTheDocument();
  });

  it('should generate unique keys for multiline messages', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Line 1\nLine 2', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    const messageElements = screen.getAllByText(/Line \d/);
    expect(messageElements).toHaveLength(2);
  });

  it('should handle mixed bold and normal messages', () => {
    const messages: SimpleMessage[] = [
      { id: '1', text: 'Normal message', bold: false },
      { id: '2', text: 'Bold message', bold: true },
      { id: '3', text: 'Another normal message', bold: false }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    const normalMessages = screen.getAllByText(/Normal message|Another normal message/);
    const boldMessage = screen.getByText('Bold message');
    
    normalMessages.forEach(msg => {
      expect(msg).not.toHaveClass('output-message--bold');
    });
    
    expect(boldMessage).toHaveClass('output-message--bold');
  });

  it('should use default maxMessages when not provided', () => {
    const messages: SimpleMessage[] = Array.from({ length: 150 }, (_, i) => ({
      id: `${i}`,
      text: `Message ${i}`,
      bold: false
    }));
    
    render(<GameOutputWindow output={messages} />);
    
    // Should only show the last 100 messages (default)
    expect(screen.queryByText('Message 49')).not.toBeInTheDocument();
    expect(screen.getByText('Message 50')).toBeInTheDocument();
    expect(screen.getByText('Message 149')).toBeInTheDocument();
  });
}); 