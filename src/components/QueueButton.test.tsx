import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import QueueButton from './QueueButton';

describe('QueueButton', () => {
  const mockOnClick = jest.fn();
  const defaultProps = {
    onClick: mockOnClick,
    label: 'Queue',
    isActive: false
  };

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  it('should render with default props', () => {
    render(<QueueButton {...defaultProps} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('queue-button');
    expect(button).not.toHaveClass('active');
  });

  it('should render with active state', () => {
    render(<QueueButton {...defaultProps} isActive={true} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    expect(button).toHaveClass('queue-button', 'active');
  });

  it('should call onClick when clicked', () => {
    render(<QueueButton {...defaultProps} />);
    
    const button = screen.getByRole('button', { name: 'Queue' });
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should display the correct label', () => {
    render(<QueueButton {...defaultProps} label="Custom Queue" />);
    
    expect(screen.getByRole('button', { name: 'Custom Queue' })).toBeInTheDocument();
  });

  it('should have correct CSS classes', () => {
    render(<QueueButton {...defaultProps} isActive={true} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('queue-button', 'active');
  });

  it('should have correct inline styles', () => {
    render(<QueueButton {...defaultProps} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveStyle({
      padding: '8px 16px',
      marginLeft: '10px',
      backgroundColor: '#2196F3',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background-color 0.3s'
    });
  });

  it('should have different background color when active', () => {
    render(<QueueButton {...defaultProps} isActive={true} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveStyle({
      backgroundColor: '#4CAF50'
    });
  });
}); 