const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    fallback: {
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser"),
      "stream": require.resolve("stream-browserify"),
      "util": require.resolve("util/"),
      "assert": require.resolve("assert/"),
      "crypto": require.resolve("crypto-browserify")
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    })
  ]
}; 