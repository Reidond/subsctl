import '@fontsource-variable/noto-sans'
import './index.css'

import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import { registerServiceWorker } from './service-worker'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}

const rootElement = document.getElementById('root')
if (rootElement) {
	createRoot(rootElement).render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>
	)
	registerServiceWorker()
} else if (import.meta.env.DEV) {
	// Helps surface missing root element issues in dev.
	console.error('[app] #root element not found')
}
