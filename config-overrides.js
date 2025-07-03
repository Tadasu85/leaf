const webpack = require('webpack');

module.exports = function override(config, env) {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "stream": require.resolve("stream-browserify"),
    "buffer": require.resolve("buffer/")
  };

  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  // Override vulnerable dependencies with newer versions (except webpack-dev-server)
  config.resolve.alias = {
    ...config.resolve.alias,
    'nth-check': require.resolve('nth-check'),
    'postcss': require.resolve('postcss'),
  };

  return config;
}; 