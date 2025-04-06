import { render, screen } from '@testing-library/react';
import GameOutputWindow from './GameOutputWindow';

describe('GameOutputWindow', () => {
  test('renders empty output window when no messages are provided', () => {
    const { container } = render(<GameOutputWindow output={[]} />);
    const outputWindow = container.querySelector('.GameOutputWindow');
    expect(outputWindow).toBeInTheDocument();
    expect(outputWindow).toHaveClass('GameOutputWindow');
  });

  test('renders regular messages correctly', () => {
    const messages = [
      { output: 'Test message 1' },
      { output: 'Test message 2' }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    messages.forEach(message => {
      expect(screen.getByText(message.output)).toBeInTheDocument();
    });
  });

  test('renders bold messages correctly', () => {
    const messages = [
      { output: 'Regular message', bold: false },
      { output: 'Bold message', bold: true }
    ];
    
    render(<GameOutputWindow output={messages} />);
    
    const regularMessage = screen.getByText('Regular message');
    const boldMessage = screen.getByText('Bold message');
    
    expect(regularMessage.tagName).toBe('SPAN');
    expect(boldMessage.tagName).toBe('B');
  });

  test('renders mixed regular and bold messages in order', () => {
    const messages = [
      { output: 'First regular' },
      { output: 'Second bold', bold: true },
      { output: 'Third regular' }
    ];
    
    const { container } = render(<GameOutputWindow output={messages} />);
    
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(3);
    
    expect(paragraphs[0].querySelector('span')).toHaveTextContent('First regular');
    expect(paragraphs[1].querySelector('b')).toHaveTextContent('Second bold');
    expect(paragraphs[2].querySelector('span')).toHaveTextContent('Third regular');
  });

  test('preserves message order', () => {
    const messages = [
      { output: 'Message 1' },
      { output: 'Message 2' },
      { output: 'Message 3' }
    ];
    
    const { container } = render(<GameOutputWindow output={messages} />);
    
    const outputTexts = Array.from(container.querySelectorAll('p'))
      .map(p => p.textContent);
    
    expect(outputTexts).toEqual(['Message 1', 'Message 2', 'Message 3']);
  });

  test('handles newlines correctly', () => {
    const messages = [
      { output: 'First line\nSecond line' },
      { output: 'Third line\nFourth line', bold: true }
    ];
    
    const { container } = render(<GameOutputWindow output={messages} />);
    
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(4);
    
    expect(paragraphs[0].querySelector('span')).toHaveTextContent('First line');
    expect(paragraphs[1].querySelector('span')).toHaveTextContent('Second line');
    expect(paragraphs[2].querySelector('b')).toHaveTextContent('Third line');
    expect(paragraphs[3].querySelector('b')).toHaveTextContent('Fourth line');
  });
}); 