import React from 'react';

interface AddDetailButtonProps {
  onClick: () => void;
  label: string;
  isActive?: boolean;
}

const AddDetailButton: React.FC<AddDetailButtonProps> = ({ onClick, label, isActive = false }) => {
  return (
    <button
      className={`sidebar__button ${isActive ? 'sidebar__button--active' : ''}`}
      onClick={onClick}
      title="Add Detail"
    >
      <div className="sidebar__button-content">
        <div className="sidebar__button-icon">➕</div>
        <div className="sidebar__button-label">{label}</div>
      </div>
    </button>
  );
};

export default AddDetailButton; 