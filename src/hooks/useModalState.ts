import { useState, useCallback } from 'react';

export function useModalState() {
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [isAddDetailModalOpen, setIsAddDetailModalOpen] = useState(false);

  const toggleBuildModal = useCallback(() => {
    setIsBuildModalOpen(prev => !prev);
  }, []);

  const toggleQueueModal = useCallback(() => {
    setIsQueueModalOpen(prev => !prev);
  }, []);

  const toggleAddDetailModal = useCallback(() => {
    setIsAddDetailModalOpen(prev => !prev);
  }, []);

  return {
    isBuildModalOpen,
    isQueueModalOpen,
    isAddDetailModalOpen,
    toggleBuildModal,
    toggleQueueModal,
    toggleAddDetailModal
  };
} 