import { Elysia } from 'elysia'
import type { Env } from '../env'
import { appError } from '../errors'
import { getDb } from '../db'
import { authPlugin } from '../auth-plugin'

export function sessionsRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api' })
		.use(authPlugin(env))
		.get(
			'/sessions',
			async ({ user }) => {
				const authUser = user as { id: string }
				const items = await db
					.selectFrom('session')
					.select(['id', 'userAgent', 'ipAddress', 'createdAt', 'updatedAt', 'expiresAt'])
					.where('userId', '=', authUser.id)
					.orderBy('updatedAt', 'desc')
					.execute()

				return {
					items: items.map((item) => ({
						id: item.id,
						device_info: item.userAgent,
						ip_address: item.ipAddress,
						created_at: item.createdAt,
						last_used: item.updatedAt,
						expires_at: item.expiresAt,
					})),
				}
			},
			{ auth: true }
		)
		.delete(
			'/sessions/:id',
			async ({ user, params }) => {
				const authUser = user as { id: string }
				const existing = await db
					.selectFrom('session')
					.select(['id'])
					.where('id', '=', params.id)
					.where('userId', '=', authUser.id)
					.executeTakeFirst()

				if (!existing) {
					throw appError.notFound('Session not found')
				}

				await db.deleteFrom('session').where('id', '=', existing.id).execute()
				return { ok: true }
			},
			{ auth: true }
		)
}
