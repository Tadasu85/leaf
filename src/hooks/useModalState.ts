import { useState, useCallback } from 'react';

export function useModalState() {
  const [isBuildModalOpen, setIsBuildModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);

  const toggleBuildModal = useCallback(() => {
    setIsBuildModalOpen(prev => !prev);
  }, []);

  const toggleQueueModal = useCallback(() => {
    setIsQueueModalOpen(prev => !prev);
  }, []);

  return {
    isBuildModalOpen,
    isQueueModalOpen,
    toggleBuildModal,
    toggleQueueModal
  };
} 