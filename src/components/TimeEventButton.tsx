import React from 'react';

interface TimeEventButtonProps {
  onClick: () => void;
  label: string;
  isActive: boolean;
}

const TimeEventButton: React.FC<TimeEventButtonProps> = ({ onClick, label, isActive }) => {
  return (
    <button
      className={`sidebar-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title="Manage time-based events and ferry rooms"
    >
      <div className="button-content">
        <div className="button-icon">⏰</div>
        <div className="button-label">{label}</div>
      </div>
    </button>
  );
};

export default TimeEventButton; 