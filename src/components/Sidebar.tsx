import React from 'react';
import BuildButton from './BuildButton';
import QueueButton from './QueueButton';
import AddDetailButton from './AddDetailButton';
import config from '../config';

interface SidebarProps {
  isSignedIn: boolean;
  isBuilder: boolean;
  isAdmin: boolean;
  username: string | null;
  currentRoomAuthor: string | null;
  isBuildModalOpen: boolean;
  isQueueModalOpen: boolean;
  isAddDetailModalOpen: boolean;
  onToggleBuildModal: () => void;
  onToggleQueueModal: () => void;
  onToggleAddDetailModal: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isSignedIn,
  isBuilder,
  isAdmin,
  username,
  currentRoomAuthor,
  isBuildModalOpen,
  isQueueModalOpen,
  isAddDetailModalOpen,
  onToggleBuildModal,
  onToggleQueueModal,
  onToggleAddDetailModal
}) => {
  if (!isSignedIn) {
    return null;
  }

  // Check if user is the owner of the current room
  const isRoomOwner = username && currentRoomAuthor && username === currentRoomAuthor;

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {isBuilder && (
          <div className="sidebar-button-container">
            <BuildButton 
              onClick={onToggleBuildModal}
              label="Build"
              isActive={isBuildModalOpen}
            />
          </div>
        )}
        {isRoomOwner && (
          <div className="sidebar-button-container">
            <AddDetailButton
              onClick={onToggleAddDetailModal}
              label="Add Detail"
              isActive={isAddDetailModalOpen}
            />
          </div>
        )}
        {isAdmin && username === config.game.account && (
          <div className="sidebar-button-container">
            <QueueButton
              onClick={onToggleQueueModal}
              label="Queue"
              isActive={isQueueModalOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar; 