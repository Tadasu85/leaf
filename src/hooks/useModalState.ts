import { useState, useCallback } from 'react';

export function useModalState() {
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [isAddDetailModalOpen, setIsAddDetailModalOpen] = useState(false);
  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState(false);

  const toggleBuildModal = useCallback(() => {
    setIsBuildModalOpen(prev => !prev);
  }, []);

  const toggleQueueModal = useCallback(() => {
    setIsQueueModalOpen(prev => !prev);
  }, []);

  const toggleAddDetailModal = useCallback(() => {
    setIsAddDetailModalOpen(prev => !prev);
  }, []);

  const toggleEditRoomModal = useCallback(() => {
    setIsEditRoomModalOpen(prev => !prev);
  }, []);

  return {
    isBuildModalOpen,
    isQueueModalOpen,
    isAddDetailModalOpen,
    isEditRoomModalOpen,
    toggleBuildModal,
    toggleQueueModal,
    toggleAddDetailModal,
    toggleEditRoomModal
  };
} 