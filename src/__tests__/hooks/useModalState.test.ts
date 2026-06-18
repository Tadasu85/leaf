import { renderHook, act } from '@testing-library/react';
import { useModalState } from '../../hooks/useModalState';

describe('useModalState', () => {
  it('starts with all modals closed', () => {
    const { result } = renderHook(() => useModalState());
    expect(result.current.isBuildModalOpen).toBe(false);
    expect(result.current.isQueueModalOpen).toBe(false);
    expect(result.current.isAddDetailModalOpen).toBe(false);
    expect(result.current.isEditRoomModalOpen).toBe(false);
  });

  describe('toggleBuildModal', () => {
    it('opens the build modal on first toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleBuildModal(); });
      expect(result.current.isBuildModalOpen).toBe(true);
    });

    it('closes the build modal on second toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleBuildModal(); });
      act(() => { result.current.toggleBuildModal(); });
      expect(result.current.isBuildModalOpen).toBe(false);
    });

    it('does not affect other modals', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleBuildModal(); });
      expect(result.current.isQueueModalOpen).toBe(false);
      expect(result.current.isAddDetailModalOpen).toBe(false);
      expect(result.current.isEditRoomModalOpen).toBe(false);
    });
  });

  describe('toggleQueueModal', () => {
    it('opens the queue modal on first toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleQueueModal(); });
      expect(result.current.isQueueModalOpen).toBe(true);
    });

    it('closes the queue modal on second toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleQueueModal(); });
      act(() => { result.current.toggleQueueModal(); });
      expect(result.current.isQueueModalOpen).toBe(false);
    });

    it('does not affect other modals', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleQueueModal(); });
      expect(result.current.isBuildModalOpen).toBe(false);
      expect(result.current.isAddDetailModalOpen).toBe(false);
      expect(result.current.isEditRoomModalOpen).toBe(false);
    });
  });

  describe('toggleAddDetailModal', () => {
    it('opens the add-detail modal on first toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleAddDetailModal(); });
      expect(result.current.isAddDetailModalOpen).toBe(true);
    });

    it('closes the add-detail modal on second toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleAddDetailModal(); });
      act(() => { result.current.toggleAddDetailModal(); });
      expect(result.current.isAddDetailModalOpen).toBe(false);
    });

    it('does not affect other modals', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleAddDetailModal(); });
      expect(result.current.isBuildModalOpen).toBe(false);
      expect(result.current.isQueueModalOpen).toBe(false);
      expect(result.current.isEditRoomModalOpen).toBe(false);
    });
  });

  describe('toggleEditRoomModal', () => {
    it('opens the edit-room modal on first toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleEditRoomModal(); });
      expect(result.current.isEditRoomModalOpen).toBe(true);
    });

    it('closes the edit-room modal on second toggle', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleEditRoomModal(); });
      act(() => { result.current.toggleEditRoomModal(); });
      expect(result.current.isEditRoomModalOpen).toBe(false);
    });

    it('does not affect other modals', () => {
      const { result } = renderHook(() => useModalState());
      act(() => { result.current.toggleEditRoomModal(); });
      expect(result.current.isBuildModalOpen).toBe(false);
      expect(result.current.isQueueModalOpen).toBe(false);
      expect(result.current.isAddDetailModalOpen).toBe(false);
    });
  });

  it('multiple modals can be open simultaneously', () => {
    const { result } = renderHook(() => useModalState());
    act(() => {
      result.current.toggleBuildModal();
      result.current.toggleQueueModal();
    });
    expect(result.current.isBuildModalOpen).toBe(true);
    expect(result.current.isQueueModalOpen).toBe(true);
    expect(result.current.isAddDetailModalOpen).toBe(false);
    expect(result.current.isEditRoomModalOpen).toBe(false);
  });
});
