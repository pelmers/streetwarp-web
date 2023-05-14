const path = require('path');
const nodeExternals = require('webpack-node-externals');
const CopyPlugin = require('copy-webpack-plugin');

const ROOT = path.resolve(__dirname, 'src');
const DESTINATION = path.resolve(__dirname, 'dist');

const clientConfig = {
    context: ROOT,

    mode: process.env.BUILD_MODE || 'development',
    entry: {
        index: './index/main.ts',
        result: './result/main.tsx',
    },

    output: {
        filename: '[name].bundle.js',
        path: DESTINATION,
    },

    resolve: {
        extensions: ['.ts', '.js', '.tsx'],
        modules: [ROOT, 'node_modules'],
    },

    plugins: [
        new CopyPlugin({
            patterns: [{ from: 'third-party' }],
        }),
    ],

    module: {
        rules: [
            /****************
             * PRE-LOADERS
             *****************/
            {
                enforce: 'pre',
                test: /\.js$/,
                use: 'source-map-loader',
            },
            {
                enforce: 'pre',
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: 'tslint-loader',
            },

            /****************
             * LOADERS
             *****************/
            {
                test: /\.tsx?$/,
                exclude: [/node_modules/],
                use: 'ts-loader',
            },
        ],
    },

    devtool: 'cheap-module-source-map',
    devServer: {},
};

const serverConfig = {
    context: ROOT,
    node: {
        __filename: true,
    },

    mode: process.env.BUILD_MODE || 'development',
    entry: {
        server: './server.ts',
    },

    output: {
        filename: '[name].bundle.js',
        path: DESTINATION,
    },

    resolve: {
        extensions: ['.ts', '.js'],
        modules: [ROOT],
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: [/node_modules/],
                use: 'ts-loader',
            },
        ],
    },

    devtool: 'cheap-module-source-map',
    target: 'node',
    externals: [nodeExternals()],
};

module.exports = [clientConfig, serverConfig];
