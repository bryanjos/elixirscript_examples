const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  devtool: 'source-map',
  cache: true,
  entry: ['./app/tmp/app/Elixir.App.js'],
  output: {
    path: path.join(__dirname, "dist"),
    filename: 'build.min.js'
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './app/html/index.html'
    }),
  ],
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /(node_modules|bower_components)/,
        use: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  }
};
