// Independently rebuild the reviewed native-service browser console.
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {localWalletStyles} from './vite.config.js';
export default defineConfig({plugins:[localWalletStyles()],build:{rollupOptions:{input:{nativeService:fileURLToPath(new URL('./native-service.html',import.meta.url))}}},server:{host:'127.0.0.1'}});
