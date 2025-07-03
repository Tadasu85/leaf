import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import QueueButton from '../../components/QueueButton';

describe('QueueButton Component', () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument();
  });

  it('displays the correct label', () => {
    render(<QueueButton onClick={mockOnClick} label="Manage Queue" isActive={false} />);
    
    expect(screen.getByRole('button', { name: 'Manage Queue' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('applies active class when isActive is true', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={true} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toHaveClass('active');
  });

  it('does not apply active class when isActive is false', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).not.toHaveClass('active');
  });

  it('has the correct base class', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toHaveClass('queue-button');
  });

  it('combines base class with active class when active', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={true} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toHaveClass('queue-button', 'active');
  });

  it('has correct styling properties', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    // Only test the styles that are actually set by the component
    expect(button).toHaveStyle({
      padding: '8px 16px',
      marginLeft: '10px',
      backgroundColor: '#2196F3',
      color: 'white',
      borderRadius: '4px',
      transition: 'background-color 0.3s'
    });
  });

  it('has correct active styling when isActive is true', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={true} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toHaveStyle({
      backgroundColor: '#4CAF50'
    });
  });

  it('has correct inactive styling when isActive is false', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toHaveStyle({
      backgroundColor: '#2196F3'
    });
  });
}); 