import React from 'react';

interface QueueButtonProps {
  onClick: () => void;
  label: string;
  isActive: boolean;
}

const QueueButton: React.FC<QueueButtonProps> = ({ onClick, label, isActive }) => {
  return (
    <button
      onClick={onClick}
      className={`queue-button ${isActive ? 'active' : ''}`}
      style={{
        padding: '8px 16px',
        marginLeft: '10px',
        backgroundColor: isActive ? '#4CAF50' : '#2196F3',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.3s'
      }}
    >
      {label}
    </button>
  );
};

export default QueueButton; 