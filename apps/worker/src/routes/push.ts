import { Elysia, t } from 'elysia'
import type { Env } from '../env'
import { appError } from '../errors'
import { ensureAppUser, getDb, nowIso } from '../db'
import { authPlugin } from '../auth-plugin'

export function pushRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api' })
		.use(authPlugin(env))
		.post(
			'/push/subscribe',
			async ({ user, body }) => {
				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				await ensureAppUser(db, authUser)
				await db.deleteFrom('push_subscriptions').where('endpoint', '=', body.endpoint).execute()
				await db
					.insertInto('push_subscriptions')
					.values({
						id: crypto.randomUUID(),
						user_id: authUser.id,
						endpoint: body.endpoint,
						p256dh: body.p256dh,
						auth: body.auth,
						created_at: nowIso(),
					})
					.execute()
				await db
					.updateTable('users')
					.set({ push_enabled: 1, updated_at: nowIso() })
					.where('id', '=', authUser.id)
					.execute()
				return { ok: true }
			},
			{
				auth: true,
				body: t.Object({
					endpoint: t.String({ minLength: 1 }),
					p256dh: t.String({ minLength: 1 }),
					auth: t.String({ minLength: 1 }),
				}),
			}
		)
		.delete(
			'/push/unsubscribe',
			async ({ user, body }) => {
				const authUser = user as { id: string }
				if (body?.endpoint) {
					await db
						.deleteFrom('push_subscriptions')
						.where('user_id', '=', authUser.id)
						.where('endpoint', '=', body.endpoint)
						.execute()
				} else {
					await db.deleteFrom('push_subscriptions').where('user_id', '=', authUser.id).execute()
				}
				const remaining = await db
					.selectFrom('push_subscriptions')
					.select(['id'])
					.where('user_id', '=', authUser.id)
					.execute()
				if (remaining.length === 0) {
					await db
						.updateTable('users')
						.set({ push_enabled: 0, updated_at: nowIso() })
						.where('id', '=', authUser.id)
						.execute()
				}
				return { ok: true }
			},
			{
				auth: true,
				body: t.Optional(
					t.Object({
						endpoint: t.String({ minLength: 1 }),
					})
				),
			}
		)
		.post(
			'/notifications/:subscriptionId/snooze',
			async ({ user, params, body }) => {
				const authUser = user as { id: string }
				const until = body?.until
				const snoozedUntil = until ? new Date(until) : new Date(Date.now() + 24 * 60 * 60 * 1000)
				if (Number.isNaN(snoozedUntil.valueOf())) {
					throw appError.badRequest('Invalid snooze date')
				}
				await db
					.deleteFrom('notification_snoozes')
					.where('subscription_id', '=', params.subscriptionId)
					.where('user_id', '=', authUser.id)
					.execute()
				await db
					.insertInto('notification_snoozes')
					.values({
						id: crypto.randomUUID(),
						subscription_id: params.subscriptionId,
						user_id: authUser.id,
						snoozed_until: snoozedUntil.toISOString(),
						created_at: nowIso(),
					})
					.execute()
				return { ok: true }
			},
			{
				auth: true,
				body: t.Optional(
					t.Object({
						until: t.Optional(t.String()),
					})
				),
			}
		)
}
