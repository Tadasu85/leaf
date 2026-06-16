import { useState, useCallback, useEffect, useRef } from 'react';
import { UserProfileJSON } from '../game/types/GameTypes';
import { GameState } from '../game/state/GameState';
import { Client } from '@hiveio/dhive';
import config from '../config';
import logger from '../utils/Logger';

export function useUserProfile(gameState: GameState | null, player: any, client: Client | null) {
  const [userProfileJSON, setUserProfileJSON] = useState<UserProfileJSON>({});
  const [isBuilder, setIsBuilder] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Refs
  const buildersList = useRef<string[]>([]);
  const hasDeterminedBuilderStatus = useRef(false);

  // Update builder status when player changes
  useEffect(() => {
    if (player) {
      // Only update builder status from player if we haven't already determined it from community
      // This prevents the player object from overriding community-based detection
      if (!hasDeterminedBuilderStatus.current) {
        setIsBuilder(player.isBuilder || false);
      }
      setIsAdmin(player.isAdmin || false);
    } else {
      setIsBuilder(false);
      setIsAdmin(false);
      hasDeterminedBuilderStatus.current = false;
    }
  }, [player]);

  // Fetch builders list from community
  const fetchBuildersList = useCallback(async () => {
    if (!client) {
      logger.debug('[useUserProfile] No client available for community fetch');
      return;
    }
    
    try {
      const communityDetailsArray = await client.hivemind.getCommunity({ 
        name: config.game.account, 
        observer: ''
      });
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;
      
      if (communityDetails && communityDetails.team) {
        const builders = communityDetails.team
          .filter(member => member[2] === "Builder")
          .map(member => member[0]);
        buildersList.current = builders;
      } else {
        buildersList.current = [];
      }
    } catch (error) {
      logger.error('[useUserProfile] Error fetching builders list:', error);
      buildersList.current = [];
    }
  }, [client]);

  // Update user profile - now takes username and fetches profile data
  const updateUserProfile = useCallback(async (username: string | null) => {
    if (!username || !client) {
      setUserProfileJSON({});
      setIsBuilder(false);
      setIsAdmin(false);
      return;
    }

    // Fetch builders list if not already loaded
    if (buildersList.current.length === 0) {
      await fetchBuildersList();
    }

    // Use dynamic builder detection from community + static config as fallback
    const isUserBuilder = buildersList.current.includes(username) || config.builders.includes(username);
    
    setIsBuilder(isUserBuilder);
    setIsAdmin(config.admins.includes(username));
    hasDeterminedBuilderStatus.current = true;

    // Also update the game state if available
    if (gameState) {
      gameState.setBuilderStatus(isUserBuilder);
    }

    // Fetch Hive profile data — single get_accounts call for both profile image and player data
    try {
      const accounts = await client.database.call('get_accounts', [[username]]);
      let profileImage: string | undefined;
      let playerData = {};

      if (accounts && accounts[0]) {
        const account = accounts[0];
        const sources = [account.posting_json_metadata, account.json_metadata];
        for (const raw of sources) {
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (!profileImage) profileImage = parsed.profile?.profile_image || undefined;
            if (!Object.keys(playerData).length && parsed.egodeathplayer) playerData = parsed.egodeathplayer;
          } catch {}
        }
      }

      setUserProfileJSON((prev) => ({
        ...prev,
        profile_image: profileImage,
        egodeathplayer: playerData
      }));
    } catch (error) {
      logger.error('[UpdateUserProfile Debug] Error fetching profile data:', error);
      setUserProfileJSON((prev) => ({ ...prev, profile_image: undefined }));
    }
  }, [client, fetchBuildersList, gameState, setUserProfileJSON, setIsBuilder, setIsAdmin]);

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

  // Check if user is builder
  const checkIfUserIsBuilder = useCallback((username: string) => {
    const isUserBuilder = buildersList.current.includes(username);
    return isUserBuilder;
  }, []);

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
    hasPermission,
    checkIfUserIsBuilder,
    fetchBuildersList
  };
} 