import { Elysia, t } from 'elysia'
import type { Env } from '../env'
import { appError } from '../errors'
import { ensureDefaultCategory, getDb, nowIso } from '../db'
import { authPlugin } from '../auth-plugin'

export function categoriesRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api' })
		.use(authPlugin(env))
		.get(
			'/categories',
			async ({ user }) => {
				const email = user.email as string
				await ensureDefaultCategory(db, email)
				const items = await db
					.selectFrom('categories')
					.leftJoin('subscriptions', (join) =>
						join
							.onRef('subscriptions.category_id', '=', 'categories.id')
							.onRef('subscriptions.owner_email', '=', 'categories.owner_email')
					)
					.selectAll('categories')
					.select((eb) => eb.fn.count('subscriptions.id').as('subscription_count'))
					.where('categories.owner_email', '=', email)
					.groupBy('categories.id')
					.orderBy('categories.name')
					.execute()
				return { items }
			},
			{ auth: true }
		)
		.post(
			'/categories',
			async ({ user, body }) => {
				const email = user.email as string
				const timestamp = nowIso()
				const record = {
					id: crypto.randomUUID(),
					owner_email: email,
					name: body.name,
					color: body.color ?? null,
					is_default: 0,
					created_at: timestamp,
				}
				await db.insertInto('categories').values(record).execute()
				return { item: record }
			},
			{
				auth: true,
				body: t.Object({
					name: t.String({ minLength: 1 }),
					color: t.Optional(t.String()),
				}),
			}
		)
		.put(
			'/categories/:id',
			async ({ user, params, body }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('categories')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()

				if (!existing) {
					throw appError.notFound('Category not found')
				}

				if (existing.is_default === 1 && body.name && body.name !== 'Default') {
					throw appError.badRequest('Default category cannot be renamed')
				}

				const next = {
					name: body.name ?? existing.name,
					color: body.color ?? existing.color,
				}

				await db.updateTable('categories').set(next).where('id', '=', params.id).execute()

				return { item: { ...existing, ...next } }
			},
			{
				auth: true,
				body: t.Object({
					name: t.Optional(t.String({ minLength: 1 })),
					color: t.Optional(t.String()),
				}),
			}
		)
		.delete(
			'/categories/:id',
			async ({ user, params }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('categories')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()

				if (!existing) {
					throw appError.notFound('Category not found')
				}

				if (existing.is_default === 1) {
					throw appError.badRequest('Default category cannot be deleted')
				}

				const fallback = await ensureDefaultCategory(db, email)
				await db
					.updateTable('subscriptions')
					.set({ category_id: fallback.id })
					.where('owner_email', '=', email)
					.where('category_id', '=', existing.id)
					.execute()

				await db.deleteFrom('categories').where('id', '=', existing.id).execute()

				return { ok: true }
			},
			{ auth: true }
		)
}
