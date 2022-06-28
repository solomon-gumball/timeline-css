const path = require('path')
const webpack = require('webpack')

module.exports = {
  context: __dirname,
  entry: './src/index.tsx',
  devtool: 'eval-cheap-module-source-map',
  mode: 'development',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'public'),
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    port: 3000,
    hot: true,
    historyApiFallback: true,
  },
  module: {
    rules: [
      {
        test: [/\.tsx$/, /\.ts$/],
        exclude: [/node_modules/, /public/],
        use: ['babel-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.svg$/,
        exclude: [/node_modules/, /public/],
        use: [
          { loader: '@svgr/webpack' }],
      },
      {
        test: [/\.scss$/i,  /\.module\.css$/, /\.css$/],
        exclude: /node_modules/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: true,
            },
          },
          'sass-loader',
        ],
      },
      {
        test: /\.js$/,
        exclude: [/node_modules/, /public/],
        use: ['source-map-loader'],
        enforce: 'pre',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      // Defaults
      NODE_ENV: 'development',
      SENTRY_RELEASE: '',
      OFFLINE_MODE: 'true',
    }),
  ],
}