import React from 'react';

interface EditRoomButtonProps {
  onClick: () => void;
  label: string;
  isActive: boolean;
}

const EditRoomButton: React.FC<EditRoomButtonProps> = ({ onClick, label, isActive }) => {
  return (
    <button
      className={`sidebar-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title="Edit Room"
    >
      <div className="button-content">
        <div className="button-icon">✏️</div>
        <div className="button-label">{label}</div>
      </div>
    </button>
  );
};

export default EditRoomButton; 