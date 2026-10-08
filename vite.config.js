import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const pages = [
  'index.html',
  'Onboarding.html',
  'Eureka.html',
  'Library.html',
  'Finished.html',
  'Discussion.html',
  'Book.html',
  'Checkout.html',
  'pantallas.html',
]

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page.replace(/\.html$/, ''), resolve(process.cwd(), page)]),
      ),
    },
  },
})
