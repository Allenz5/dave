const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Supabase code lives in ../supabase; its dependencies resolve from app/node_modules
config.watchFolders = [path.resolve(__dirname, '../supabase')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = withNativeWind(config, { input: './src/global.css' });
