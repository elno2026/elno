import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const tlsKey = path.join(rootDir, '.cert/local-key.pem')
const tlsCert = path.join(rootDir, '.cert/local-cert.pem')
const useHttps = process.env.OSOCIAL_DEV_HTTPS === 'true'
const https = useHttps && fs.existsSync(tlsKey) && fs.existsSync(tlsCert) ? {
  key: fs.readFileSync(tlsKey),
  cert: fs.readFileSync(tlsCert),
} : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    https,
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
})
