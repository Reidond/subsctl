import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		{
			name: 'spa-fallback',
			configureServer(server) {
				server.middlewares.use((req, _res, next) => {
					if (!req.url) {
						return next()
					}
					if (req.url.startsWith('/@') || req.url.startsWith('/api')) {
						return next()
					}
					if (req.url.includes('.')) {
						return next()
					}
					req.url = '/'
					return next()
				})
			},
		},
		TanStackRouterVite({
			routesDirectory: './src/routes',
			generatedRouteTree: './src/routeTree.gen.ts',
		}),
		react(),
		tailwindcss(),
	],
	appType: 'spa',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		fs: {
			strict: false,
		},
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:8787',
				changeOrigin: true,
			},
		},
	},
})
