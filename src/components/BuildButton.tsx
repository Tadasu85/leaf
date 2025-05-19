import React from 'react';

interface BuildButtonProps {
  onClick: () => void;
  label: string;
  isActive?: boolean;
}

const BuildButton: React.FC<BuildButtonProps> = ({ onClick, label, isActive = false }) => {
  return (
    <button 
      className={`top-right-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default BuildButton; 