import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BuildButton from './BuildButton';

describe('BuildButton', () => {
  const mockOnClick = jest.fn();
  const defaultProps = {
    onClick: mockOnClick,
    label: 'Build Room'
  };

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  it('should render with default props', () => {
    render(<BuildButton {...defaultProps} />);
    
    const button = screen.getByRole('button', { name: 'Build Room' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('top-right-button');
    expect(button).not.toHaveClass('active');
  });

  it('should render with active state', () => {
    render(<BuildButton {...defaultProps} isActive={true} />);
    
    const button = screen.getByRole('button', { name: 'Build Room' });
    expect(button).toHaveClass('top-right-button', 'active');
  });

  it('should call onClick when clicked', () => {
    render(<BuildButton {...defaultProps} />);
    
    const button = screen.getByRole('button', { name: 'Build Room' });
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should display the correct label', () => {
    render(<BuildButton {...defaultProps} label="Custom Label" />);
    
    expect(screen.getByRole('button', { name: 'Custom Label' })).toBeInTheDocument();
  });

  it('should have correct CSS classes', () => {
    render(<BuildButton {...defaultProps} isActive={true} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('top-right-button', 'active');
  });
}); 