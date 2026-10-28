import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true // exposes on your local network, e.g. http://192.168.x.x:5173, so you can test on your phone
  }
});
