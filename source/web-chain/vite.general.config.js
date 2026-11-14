// Independently rebuild the editable generated record-app frontend.
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({build:{rollupOptions:{input:{generalApp:fileURLToPath(new URL('./general-app.html',import.meta.url))}}},server:{host:'127.0.0.1'}});
