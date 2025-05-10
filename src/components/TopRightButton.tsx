import React from 'react';
import './TopRightButton.css';

interface TopRightButtonProps {
  onClick: () => void;
  label: string;
  isActive?: boolean;
}

const TopRightButton: React.FC<TopRightButtonProps> = ({ onClick, label, isActive = false }) => {
  return (
    <button 
      className={`top-right-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default TopRightButton; 