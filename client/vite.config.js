import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:3002'},'/ws':{target:'ws://127.0.0.1:3002',ws:true}}},build:{outDir:'../server/public',emptyOutDir:true}});
