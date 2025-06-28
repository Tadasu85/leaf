import { useState, useCallback, useEffect } from 'react';
import { UserProfileJSON } from '../game/types/GameTypes';
import { GameState } from '../game/state/GameState';

export function useUserProfile(gameState: GameState | null, player: any) {
  const [userProfileJSON, setUserProfileJSON] = useState<UserProfileJSON>({});
  const [isBuilder, setIsBuilder] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Update builder status when player changes
  useEffect(() => {
    if (player) {
      setIsBuilder(player.isBuilder || false);
      setIsAdmin(player.isAdmin || false);
    } else {
      setIsBuilder(false);
      setIsAdmin(false);
    }
  }, [player]);

  // Update user profile
  const updateUserProfile = useCallback((profile: UserProfileJSON) => {
    setUserProfileJSON(profile);
  }, []);

  // Update builder status
  const updateBuilderStatus = useCallback((isBuilder: boolean) => {
    setIsBuilder(isBuilder);
    if (gameState) {
      gameState.setBuilderStatus(isBuilder);
    }
  }, [gameState]);

  // Update admin status
  const updateAdminStatus = useCallback((isAdmin: boolean) => {
    setIsAdmin(isAdmin);
  }, []);

  // Get user profile
  const getUserProfile = useCallback(() => {
    return userProfileJSON;
  }, [userProfileJSON]);

  // Check if user has specific permission
  const hasPermission = useCallback((permission: string) => {
    if (isAdmin) return true;
    if (permission === 'builder' && isBuilder) return true;
    return false;
  }, [isAdmin, isBuilder]);

  return {
    // State
    userProfileJSON,
    isBuilder,
    isAdmin,
    
    // Actions
    updateUserProfile,
    updateBuilderStatus,
    updateAdminStatus,
    getUserProfile,
    hasPermission
  };
} 