import { useMemo } from 'react';
import { Client } from '@hiveio/dhive';
import { KeychainSDK } from 'keychain-sdk';
import config from '../config';
import logger from '../utils/Logger';

// Type declarations for mobile app interfaces
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    webkit?: {
      messageHandlers?: {
        keychain?: any;
      };
    };
    keychainInterface?: any;
  }
}

// Detect if we're on a mobile platform
const isMobile = () => {
  const userAgent = navigator.userAgent;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isMobileViewport = window.innerWidth <= 768 && window.innerHeight <= 1024;
  
  // Additional checks to ensure we're really on mobile
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isStandalone = (window.navigator as any).standalone === true; // iOS PWA mode
  
  const result = isMobileUA || (isMobileViewport && isTouchDevice);
  
  logger.debug('[Mobile Detection]', {
    userAgent,
    isMobileUA,
    isMobileViewport,
    isTouchDevice,
    isStandalone,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    result
  });
  
  return result;
};

// Detect if we're in a mobile app environment (like Hive Keychain app)
const isInMobileApp = () => {
  return window.ReactNativeWebView || 
         window.webkit?.messageHandlers?.keychain ||
         window.keychainInterface;
};

// Mobile keychain app fallback URL (for future use)
// const MOBILE_KEYCHAIN_FALLBACK = 'https://hive-keychain.com/';

// Hive Keychain API endpoints for mobile integration
const KEYCHAIN_MOBILE_API = 'https://api.hive-keychain.com';

// Try to use Hive Keychain API for mobile integration
const callKeychainAPI = async (action: string, params: any): Promise<{ success: boolean; data?: any }> => {
  logger.debug('[Mobile Keychain] Attempting API call:', { action, params });
  
  try {
    // Try the mobile API first
    const mobileApiUrl = `${KEYCHAIN_MOBILE_API}/${action}`;
    const response = await fetch(mobileApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        app: 'leaf-game',
        callback: window.location.origin + '/keychain-callback'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.debug('[Mobile Keychain] API call successful:', result);
      return { success: true, data: result };
    } else {
      logger.debug('[Mobile Keychain] Mobile API failed, trying fallback');
      throw new Error(`Mobile API failed: ${response.status}`);
    }
  } catch (error) {
    logger.debug('[Mobile Keychain] API call failed, using URL scheme fallback:', error);
    
    // Fallback to URL scheme if API is not available
    const fallbackResult = await openMobileKeychainAppFallback(action, params);
    return { success: fallbackResult };
  }
};

// Fallback URL scheme method (kept for compatibility)
const openMobileKeychainAppFallback = (action: string, params: any) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  // Build URL with proper format for mobile app API
  const queryParams = new URLSearchParams(params).toString();
  
  // Try the most likely URL scheme first (based on package name)
  let primaryUrl: string;
  let fallbackUrls: string[];
  
  if (action === 'login') {
    // For login, try different URL formats that mobile apps commonly use
    primaryUrl = `mobilekeychain://login?${queryParams}`;
    fallbackUrls = [
      `hivekeychain://login?${queryParams}`,
      `hive-keychain://login?${queryParams}`,
      `com.mobilekeychain://login?${queryParams}`,
      `hive://login?${queryParams}`,
      `keychain://login?${queryParams}`,
      // Try alternative login URL formats
      `mobilekeychain://auth?${queryParams}`,
      `hivekeychain://auth?${queryParams}`,
      `mobilekeychain://signin?${queryParams}`,
      `hivekeychain://signin?${queryParams}`
    ];
  } else {
    // For other actions, use standard format
    primaryUrl = `mobilekeychain://${action}?${queryParams}`;
    fallbackUrls = [
      `hivekeychain://${action}?${queryParams}`,
      `hive-keychain://${action}?${queryParams}`,
      `com.mobilekeychain://${action}?${queryParams}`,
      `hive://${action}?${queryParams}`,
      `keychain://${action}?${queryParams}`
    ];
  }
  
  logger.debug('[Mobile Keychain] Attempting URL scheme fallback with primary URL:', primaryUrl);
  
  return new Promise<boolean>((resolve) => {
    let appOpened = false;
    let attempts = 0;
    const maxAttempts = fallbackUrls.length + 1; // +1 for primary URL
    
    // Function to try next URL scheme
    const tryNextUrl = () => {
      if (appOpened || attempts >= maxAttempts) {
        if (!appOpened) {
          logger.debug('[Mobile Keychain] All URL schemes failed, app not installed');
          showAppStoreLinks(isIOS);
        }
        resolve(appOpened);
        return;
      }
      
      const url = attempts === 0 ? primaryUrl : fallbackUrls[attempts - 1];
      attempts++;
      
      logger.debug(`[Mobile Keychain] Trying URL scheme ${attempts}/${maxAttempts}:`, url);
      
      // Try to open the app
      try {
        // Create a hidden iframe to test if the URL scheme works
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        
        // Remove iframe after a short delay
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 100);
        
        // Also try direct navigation
        setTimeout(() => {
          try {
            window.location.href = url;
          } catch (error) {
            logger.error(`[Mobile Keychain] Navigation failed for URL ${attempts}:`, error);
          }
        }, 200);
        
        // Check if app opened after a delay
        setTimeout(() => {
          // Check multiple indicators that the app opened
          const indicators = [
            document.hidden,
            (document as any).webkitHidden,
            window.navigator.userAgent.includes('Mobile'),
            // Add more detection methods as needed
          ];
          
          const appOpenedIndicator = indicators.some(indicator => indicator);
          
          if (appOpenedIndicator && !appOpened) {
            appOpened = true;
            logger.debug('[Mobile Keychain] URL scheme attempted - app may have opened');
            resolve(true);
          } else {
            // Try next URL scheme
            setTimeout(tryNextUrl, 1000);
          }
        }, 2000);
        
      } catch (error) {
        logger.error(`[Mobile Keychain] Failed to try URL scheme ${attempts}:`, error);
        setTimeout(tryNextUrl, 1000);
      }
    };
    
    // Start trying URL schemes
    tryNextUrl();
  });
};

// Show app store links when keychain app isn't installed
const showAppStoreLinks = (isIOS: boolean) => {
  // Use the correct app store URLs based on the actual Hive Keychain app
  const appStoreUrl = isIOS 
    ? 'https://apps.apple.com/app/hive-keychain/id1593351417'
    : 'https://play.google.com/store/apps/details?id=com.mobilekeychain';
  
  const message = `Hive Keychain app is required for mobile login. Please install it from your device's app store:
  
iOS: https://apps.apple.com/app/hive-keychain/id1593351417
Android: https://play.google.com/store/apps/details?id=com.mobilekeychain

After installing, please refresh this page and try again.`;
  
  // Show a user-friendly message
  alert(message);
  
  // Also try to open the app store
  try {
    window.open(appStoreUrl, '_blank');
  } catch (error) {
    logger.error('[Mobile Keychain] Failed to open app store:', error);
  }
};

export function useClients() {
  const hivenode = config.hive.nodes[0];
  
  const client = useMemo(() => new Client([hivenode]), [hivenode]);
  
  const keychain = useMemo(() => {
    const mobile = isMobile();
    const inApp = isInMobileApp();
    
    logger.debug('[useClients] Platform detection:', {
      mobile,
      inApp,
      userAgent: navigator.userAgent,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });

    // Only use mobile keychain integration on actual mobile devices
    // AND not when already in a keychain app
    if (mobile && !inApp) {
      // On mobile but not in a keychain app - use mobile keychain integration
      logger.info('[useClients] Mobile detected but not in keychain app - using mobile keychain integration');
      
      // Create a mobile-compatible keychain interface
      return {
        login: async (params: any) => {
          logger.debug('[Mobile Keychain] Login attempt:', params);
          
          const username = params.username;
          
          // Show user that we're attempting to open the keychain app
          const userMessage = `Attempting to open Hive Keychain app for login with @${username}...`;
          logger.info('[Mobile Keychain]', userMessage);
          
          try {
            // Try to open the app and wait for result
            // Use the correct parameters for Hive Keychain mobile app login
            // Based on keychain-sdk login format
            const loginData = {
              username,
              message: JSON.stringify({ login: Date.now().toString() }),
              method: params.method || 'posting',
              title: 'Login'
            };
            
            // Try to use Hive Keychain API for mobile integration
            try {
              const apiResult = await callKeychainAPI('login', loginData);
              
              if (apiResult.success) {
                return {
                  success: true,
                  data: apiResult.data
                };
              }
            } catch (apiError) {
              logger.debug('[Mobile Keychain] API call failed, using fallback:', apiError);
            }
            
            // API failed, fallback to URL scheme
            const urlAttempted = await openMobileKeychainAppFallback('login', loginData);
            
            if (urlAttempted) {
              return {
                success: false,
                error: 'mobile_app_redirect',
                message: userMessage,
                data: { 
                  username, 
                  requiresApp: true, 
                  urlAttempted: true,
                  instructions: 'URL scheme attempted. If the Hive Keychain app opened, please complete the login there. If not, you may need to install the app first.'
                }
              };
            } else {
              return {
                success: false,
                error: 'mobile_keychain_required',
                message: `Hive Keychain app is required for mobile login. Please install it from your device's app store.`,
                data: { 
                  username, 
                  requiresApp: true, 
                  urlAttempted: false,
                  instructions: 'Please install the Hive Keychain app and try again.'
                }
              };
            }
          } catch (error) {
            logger.error('[Mobile Keychain] Login error:', error);
            return {
              success: false,
              error: 'mobile_keychain_error',
              message: 'Failed to open Hive Keychain app.',
              data: { 
                username, 
                requiresApp: true, 
                appOpened: false,
                error: error instanceof Error ? error.message : String(error)
              }
            };
          }
        },
        
        broadcast: async (params: any) => {
          logger.debug('[Mobile Keychain] Broadcast attempt:', params);
          
          const userMessage = 'Attempting to open Hive Keychain app for transaction...';
          logger.info('[Mobile Keychain]', userMessage);
          
          // Try to use Hive Keychain API for mobile integration
          const apiResult = await callKeychainAPI('broadcast', {
            operations: JSON.stringify(params.operations),
            method: params.method || 'posting',
            callback: window.location.origin + '/keychain-callback'
          });
          
          const urlAttempted = apiResult.success;
          
          return {
            success: false,
            error: 'mobile_app_redirect',
            message: userMessage,
            data: { 
              requiresApp: true, 
              urlAttempted,
              instructions: 'URL scheme attempted. If the Hive Keychain app opened, please complete the transaction there. If not, you may need to install the app first.'
            }
          };
        },
        
        post: async (params: any) => {
          logger.debug('[Mobile Keychain] Post attempt:', params);
          
          const userMessage = 'Attempting to open Hive Keychain app for post...';
          logger.info('[Mobile Keychain]', userMessage);
          
          // Try to use Hive Keychain API for mobile integration
          const apiResult = await callKeychainAPI('post', {
            ...params,
            method: 'posting',
            callback: window.location.origin + '/keychain-callback'
          });
          
          const urlAttempted = apiResult.success;
          
          return {
            success: false,
            error: 'mobile_app_redirect',
            message: userMessage,
            data: { 
              requiresApp: true, 
              urlAttempted,
              instructions: 'URL scheme attempted. If the Hive Keychain app opened, please complete the post there. If not, you may need to install the app first.'
            }
          };
        }
      };
    } else {
      // Desktop or in-app mobile - use standard keychain SDK
      if (mobile && inApp) {
        logger.info('[useClients] Mobile detected but in keychain app - using standard KeychainSDK');
      } else {
        logger.info('[useClients] Desktop detected - using standard KeychainSDK');
      }
      return new KeychainSDK(window, { rpc: hivenode });
    }
  }, [hivenode]);

  return {
    client,
    keychain
  };
} 