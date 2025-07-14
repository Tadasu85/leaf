import React from 'react';

interface EditRoomButtonProps {
  onClick: () => void;
  label: string;
  isActive: boolean;
}

const EditRoomButton: React.FC<EditRoomButtonProps> = ({ onClick, label, isActive }) => {
  return (
    <button
      className={`sidebar__button ${isActive ? 'sidebar__button--active' : ''}`}
      onClick={onClick}
      title="Edit Room"
    >
      <div className="sidebar__button-content">
        <div className="sidebar__button-icon">✏️</div>
        <div className="sidebar__button-label">{label}</div>
      </div>
    </button>
  );
};

export default EditRoomButton; 