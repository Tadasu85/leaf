import React from 'react';

interface QueueButtonProps {
  onClick: () => void;
  label: string;
  isActive: boolean;
}

const QueueButton: React.FC<QueueButtonProps> = ({ onClick, label, isActive }) => {
  return (
    <button
      className={`sidebar__button ${isActive ? 'sidebar__button--active' : ''}`}
      onClick={onClick}
      title="Queue Management"
    >
      <div className="sidebar__button-content">
        <div className="sidebar__button-icon">📋</div>
        <div className="sidebar__button-label">{label}</div>
      </div>
    </button>
  );
};

export default QueueButton; 