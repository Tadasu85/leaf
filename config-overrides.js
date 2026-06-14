const webpack = require('webpack');

/**
 * Config overrides for Create React App
 * 
 * This file customizes the webpack configuration without ejecting from Create React App.
 * It's used by react-app-rewired to modify the build process.
 * 
 * Purpose:
 * 1. Provide Node.js polyfills for browser environment (needed for blockchain operations)
 * 2. Override vulnerable dependencies with secure versions
 * 3. Add webpack plugins for Buffer support
 */

module.exports = function override(config, env) {
  // Add Node.js polyfills for browser environment
  // These are needed for @hiveio/dhive and other blockchain libraries
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "stream": require.resolve("stream-browserify"),
    "buffer": require.resolve("buffer/"),
    "process": require.resolve("process/browser")
  };

  // Add webpack plugins for global Buffer support
  // Required for blockchain operations that expect Buffer to be available globally
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: ['process/browser'],
    }),
  ];

  // Override vulnerable dependencies with secure versions
  // This prevents security warnings and ensures we use patched versions
  config.resolve.alias = {
    ...config.resolve.alias,
    'nth-check': require.resolve('nth-check'),
    'postcss': require.resolve('postcss'),
  };

  return config;
}; 