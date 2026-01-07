self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
	const data = event.data ? event.data.json() : null
	const title = data?.title ?? 'Subscription renewal'
	const body = data?.body ?? 'A subscription renews soon.'
	const url = data?.url ?? '/dashboard'
	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: '/icon.svg',
			badge: '/icon.svg',
			data: { url },
		})
	)
})

self.addEventListener('notificationclick', (event) => {
	event.notification.close()
	const url = event.notification.data?.url ?? '/dashboard'
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
			const existing = clientsArr.find((client) => client.url.includes(url))
			if (existing) {
				return existing.focus()
			}
			return self.clients.openWindow(url)
		})
	)
})
