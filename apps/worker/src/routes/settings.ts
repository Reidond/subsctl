import { Elysia, t } from 'elysia'
import type { Env } from '../env'
import { ensureAppUser, getDb, nowIso } from '../db'
import { authPlugin } from '../auth-plugin'

export function settingsRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api' }).use(authPlugin(env)).put(
		'/settings',
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
					primary_currency: body.primaryCurrency ?? undefined,
					timezone: body.timezone ?? undefined,
					push_enabled: body.pushEnabled === undefined ? undefined : body.pushEnabled ? 1 : 0,
					updated_at: nowIso(),
				})
				.where('id', '=', authUser.id)
				.execute()

			return { ok: true }
		},
		{
			auth: true,
			body: t.Object({
				primaryCurrency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
				timezone: t.Optional(t.String()),
				pushEnabled: t.Optional(t.Boolean()),
			}),
		}
	)
}
