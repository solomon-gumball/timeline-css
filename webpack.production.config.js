const path = require('path')
const webpack = require('webpack')
const SentryWebpackPlugin = require('@sentry/webpack-plugin')
const uuid = require('uuid')
const devConfig = require('./webpack.development.config')

const SENTRY_RELEASE = new Date()
  .toLocaleString('en-US', { timeZone: 'PST', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  .replaceAll(', ', '-').replaceAll('/', '.').replaceAll(':', '.')

module.exports = {
  ...devConfig,
  devtool: 'hidden-source-map',
  mode: 'production',
  devServer: undefined,
  optimization: {
    minimize: true,
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
      SENTRY_RELEASE,
    }),
    new SentryWebpackPlugin({
      org: 'timelinecss',
      project: 'web-app',
      release: SENTRY_RELEASE,
      entries: ['src/index.tsx'],
      ignore: ['node_modules', 'webpack.config.js'],
    }),
  ],
}