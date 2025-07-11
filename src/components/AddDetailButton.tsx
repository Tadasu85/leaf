import React from 'react';

interface AddDetailButtonProps {
  onClick: () => void;
  label: string;
  isActive?: boolean;
}

const AddDetailButton: React.FC<AddDetailButtonProps> = ({ onClick, label, isActive = false }) => {
  return (
    <button 
      className={`sidebar-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default AddDetailButton; 