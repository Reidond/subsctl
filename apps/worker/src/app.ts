import { Elysia } from 'elysia'
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker'
import type { Env } from './env'
import { AppError } from './errors'
import { authPlugin } from './auth-plugin'
import { ensureAppUser, getDb } from './db'
import { categoriesRoutes } from './routes/categories'
import { exportRoutes } from './routes/export'
import { fxRoutes } from './routes/fx'
import { onboardingRoutes } from './routes/onboarding'
import { pushRoutes } from './routes/push'
import { sessionsRoutes } from './routes/sessions'
import { settingsRoutes } from './routes/settings'
import { statsRoutes } from './routes/stats'
import { subscriptionsRoutes } from './routes/subscriptions'

export function createApp(env: Env) {
	const db = getDb(env)

	return new Elysia({
		adapter: CloudflareAdapter,
	})
		.onError(({ error, set }) => {
			if (error instanceof AppError) {
				set.status = error.status
				return {
					error: {
						code: error.code,
						message: error.message,
						details: error.details,
					},
				}
			}

			set.status = 500
			return {
				error: {
					code: 'INTERNAL',
					message: 'Internal Server Error',
				},
			}
		})
		.use(authPlugin(env))
		.get('/api/health', () => ({
			ok: true,
			version: env.APP_VERSION ?? 'dev',
		}))
		.get(
			'/api/me',
			async ({ user }) => {
				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				const settings = await ensureAppUser(db, authUser)
				return {
					user: {
						email: authUser.email,
						name: authUser.name ?? authUser.email,
						image: authUser.image ?? null,
						primaryCurrency: settings.primary_currency ?? null,
						timezone: settings.timezone ?? null,
						pushEnabled: settings.push_enabled === 1,
						onboardingDone: Boolean(settings.onboarding_done),
					},
				}
			},
			{ auth: true }
		)
		.use(sessionsRoutes(env))
		.use(onboardingRoutes(env))
		.use(categoriesRoutes(env))
		.use(subscriptionsRoutes(env))
		.use(statsRoutes(env))
		.use(settingsRoutes(env))
		.use(fxRoutes(env))
		.use(pushRoutes(env))
		.use(exportRoutes(env))
}
