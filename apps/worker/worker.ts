import { createApp } from './src/app'
import { getAuth } from './src/auth'
import { getDb } from './src/db'
import type { Env } from './src/env'
import { refreshFxRates } from './src/fx'
import { sendRenewalNotifications } from './src/push'
import { type EmbeddingMessage, generateEmbedding, upsertVectorizeEmbedding } from './src/vectorize'

let cachedApp: ReturnType<typeof createApp> | null = null

function getApp(env: Env) {
	if (!cachedApp) {
		cachedApp = createApp(env)
	}
	return cachedApp
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url)
		if (url.pathname.startsWith('/api/auth')) {
			const auth = getAuth(env)
			return auth.handler(request)
		}

		if (url.pathname.startsWith('/api')) {
			return getApp(env).handle(request)
		}

		if (env.ASSETS) {
			return env.ASSETS.fetch(request)
		}

		return new Response('Not Found', { status: 404 })
	},
	async queue(batch: MessageBatch<unknown>, env: Env) {
		if (!env.VECTORIZE) {
			for (const message of batch.messages) {
				message.ack()
			}
			return
		}

		for (const message of batch.messages) {
			try {
				const payload = message.body as EmbeddingMessage
				const embedding = await generateEmbedding(env.AI, payload.text)
				await upsertVectorizeEmbedding(env.VECTORIZE, payload.subscriptionId, embedding)
				message.ack()
			} catch (error) {
				console.error('Failed to process embedding message:', error)
				message.retry()
			}
		}
	},
	async scheduled(_controller: ScheduledController, env: Env) {
		const db = getDb(env)
		await refreshFxRates(env, db)
		await sendRenewalNotifications(env, db)
	},
}
