import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BuildButton from '../../components/BuildButton';

describe('BuildButton Component', () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" />);
    
    expect(screen.getByRole('button', { name: '🏗️ Build' })).toBeInTheDocument();
  });

  it('displays the correct label', () => {
    render(<BuildButton onClick={mockOnClick} label="Create Room" />);
    
    expect(screen.getByRole('button', { name: '🏗️ Create Room' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" />);
    
    const button = screen.getByRole('button', { name: '🏗️ Build' });
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('applies active class when isActive is true', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" isActive={true} />);
    
    const button = screen.getByRole('button', { name: '🏗️ Build' });
    expect(button).toHaveClass('sidebar__button--active');
  });

  it('does not apply active class when isActive is false', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" isActive={false} />);
    
    const button = screen.getByRole('button', { name: '🏗️ Build' });
    expect(button).not.toHaveClass('sidebar__button--active');
  });

  it('does not apply active class when isActive is not provided', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" />);
    
    const button = screen.getByRole('button', { name: '🏗️ Build' });
    expect(button).not.toHaveClass('sidebar__button--active');
  });

  it('has the correct base class', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" />);
    
    const button = screen.getByRole('button', { name: '🏗️ Build' });
    expect(button).toHaveClass('sidebar__button');
  });

  it('combines base class with active class when active', () => {
    render(<BuildButton onClick={mockOnClick} label="Build" isActive={true} />);
    
    const button = screen.getByRole('button', { name: '🏗️ Build' });
    expect(button).toHaveClass('sidebar__button', 'sidebar__button--active');
  });
}); 