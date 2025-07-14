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
    
    expect(screen.getByRole('button', { name: '📋 Queue' })).toBeInTheDocument();
  });

  it('displays the correct label', () => {
    render(<QueueButton onClick={mockOnClick} label="Manage Queue" isActive={false} />);
    
    expect(screen.getByRole('button', { name: '📋 Manage Queue' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('applies active class when isActive is true', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={true} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    expect(button).toHaveClass('sidebar__button--active');
  });

  it('does not apply active class when isActive is false', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    expect(button).not.toHaveClass('sidebar__button--active');
  });

  it('has the correct base class', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    expect(button).toHaveClass('sidebar__button');
  });

  it('combines base class with active class when active', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={true} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    expect(button).toHaveClass('sidebar__button', 'sidebar__button--active');
  });

  it('has correct styling properties', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    // Test that the component has the correct CSS classes for styling
    expect(button).toHaveClass('sidebar__button');
  });

  it('has correct active styling when isActive is true', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={true} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    expect(button).toHaveClass('sidebar__button--active');
  });

  it('has correct inactive styling when isActive is false', () => {
    render(<QueueButton onClick={mockOnClick} label="Queue" isActive={false} />);
    
    const button = screen.getByRole('button', { name: '📋 Queue' });
    expect(button).toHaveClass('sidebar__button');
    expect(button).not.toHaveClass('sidebar__button--active');
  });
}); 