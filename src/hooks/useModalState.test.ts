import { renderHook, act } from '@testing-library/react';
import { useModalState } from './useModalState';

describe('useModalState', () => {
  it('should initialize with both modals closed', () => {
    const { result } = renderHook(() => useModalState());
    expect(result.current.isBuildModalOpen).toBe(false);
    expect(result.current.isQueueModalOpen).toBe(false);
  });

  it('should toggle build modal', () => {
    const { result } = renderHook(() => useModalState());
    act(() => {
      result.current.toggleBuildModal();
    });
    expect(result.current.isBuildModalOpen).toBe(true);
    act(() => {
      result.current.toggleBuildModal();
    });
    expect(result.current.isBuildModalOpen).toBe(false);
  });

  it('should toggle queue modal', () => {
    const { result } = renderHook(() => useModalState());
    act(() => {
      result.current.toggleQueueModal();
    });
    expect(result.current.isQueueModalOpen).toBe(true);
    act(() => {
      result.current.toggleQueueModal();
    });
    expect(result.current.isQueueModalOpen).toBe(false);
  });

  it('should not affect the other modal when toggling one', () => {
    const { result } = renderHook(() => useModalState());
    act(() => {
      result.current.toggleBuildModal();
    });
    expect(result.current.isBuildModalOpen).toBe(true);
    expect(result.current.isQueueModalOpen).toBe(false);
    act(() => {
      result.current.toggleQueueModal();
    });
    expect(result.current.isBuildModalOpen).toBe(true);
    expect(result.current.isQueueModalOpen).toBe(true);
  });
}); 