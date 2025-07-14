import React from 'react';

interface BuildButtonProps {
  onClick: () => void;
  label: string;
  isActive?: boolean;
}

const BuildButton: React.FC<BuildButtonProps> = ({ onClick, label, isActive = false }) => {
  return (
    <button
      className={`sidebar__button ${isActive ? 'sidebar__button--active' : ''}`}
      onClick={onClick}
      title="Build Room"
    >
      <div className="sidebar__button-content">
        <div className="sidebar__button-icon">🏗️</div>
        <div className="sidebar__button-label">{label}</div>
      </div>
    </button>
  );
};

export default BuildButton; 