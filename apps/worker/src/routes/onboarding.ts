import { Elysia, t } from 'elysia'
import type { Env } from '../env'
import { ensureAppUser, getDb, nowIso } from '../db'
import { authPlugin } from '../auth-plugin'

export function onboardingRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api/onboarding' })
		.use(authPlugin(env))
		.post(
			'/timezone',
			async ({ user, body }) => {
				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				await ensureAppUser(db, authUser)
				await db
					.updateTable('users')
					.set({
						timezone: body.timezone,
						updated_at: nowIso(),
					})
					.where('id', '=', authUser.id)
					.execute()
				return { ok: true }
			},
			{
				auth: true,
				body: t.Object({
					timezone: t.String({ minLength: 1 }),
				}),
			}
		)
		.post(
			'/currency',
			async ({ user, body }) => {
				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				await ensureAppUser(db, authUser)
				await db
					.updateTable('users')
					.set({
						primary_currency: body.currency,
						updated_at: nowIso(),
					})
					.where('id', '=', authUser.id)
					.execute()
				return { ok: true }
			},
			{
				auth: true,
				body: t.Object({
					currency: t.String({ minLength: 3, maxLength: 3 }),
				}),
			}
		)
		.post(
			'/complete',
			async ({ user }) => {
				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				await ensureAppUser(db, authUser)
				await db
					.updateTable('users')
					.set({
						onboarding_done: 1,
						updated_at: nowIso(),
					})
					.where('id', '=', authUser.id)
					.execute()
				return { ok: true }
			},
			{ auth: true }
		)
}
