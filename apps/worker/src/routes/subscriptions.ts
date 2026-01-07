import { Elysia, t } from 'elysia'
import type { Env } from '../env'
import {
	advanceRenewal,
	ensureDefaultCategory,
	ensureAppUser,
	getDb,
	getRateToPrimary,
	nowIso,
	type SubscriptionStatus,
} from '../db'
import { appError } from '../errors'
import { authPlugin } from '../auth-plugin'
import { consumeRateLimit } from '../throttle'
import {
	buildSearchText,
	type EmbeddingMessage,
	searchVectorize,
	findSimilarSubscriptions,
} from '../vectorize'

const cadenceUnitSchema = t.Union([
	t.Literal('day'),
	t.Literal('week'),
	t.Literal('month'),
	t.Literal('year'),
])

const statusSchema = t.Union([
	t.Literal('active'),
	t.Literal('paused'),
	t.Literal('archived'),
	t.Literal('all'),
])

function parseIso(value: string, field: string) {
	const date = new Date(value)
	if (Number.isNaN(date.valueOf())) {
		throw appError.badRequest(`${field} must be ISO datetime`)
	}
	return date
}

export function subscriptionsRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api' })
		.use(authPlugin(env))
		.get(
			'/subscriptions',
			async ({ user, query }) => {
				const email = user.email as string
				const status = query.status ?? 'active'
				if (query.q && !env.VECTORIZE) {
					throw appError.badRequest('Search unavailable')
				}

				if (query.q && env.VECTORIZE) {
					const authUser = user as { id: string }
					const allowed = consumeRateLimit(`vectorize-search:${authUser.id}`, 20, 60_000)
					if (!allowed) {
						throw appError.tooManyRequests('Search rate limit exceeded')
					}
					const matches = await searchVectorize(env.AI, env.VECTORIZE, query.q, 50)
					const subscriptionIds = matches.map((m) => m.id)

					if (subscriptionIds.length === 0) {
						return { items: [] }
					}

					let vectorBuilder = db
						.selectFrom('subscriptions')
						.selectAll()
						.where('owner_email', '=', email)
						.where('id', 'in', subscriptionIds)
					if (query.from) {
						vectorBuilder = vectorBuilder.where('next_renewal_at', '>=', query.from)
					}
					if (query.to) {
						vectorBuilder = vectorBuilder.where('next_renewal_at', '<=', query.to)
					}
					const items = await vectorBuilder.execute()

					const orderedItems = subscriptionIds
						.map((id) => items.find((item) => item.id === id))
						.filter(Boolean)

					return { items: orderedItems }
				}

				let builder = db.selectFrom('subscriptions').selectAll().where('owner_email', '=', email)

				if (status !== 'all') {
					builder = builder.where('status', '=', status as SubscriptionStatus)
				}

				if (query.from) {
					builder = builder.where('next_renewal_at', '>=', query.from)
				}
				if (query.to) {
					builder = builder.where('next_renewal_at', '<=', query.to)
				}

				const items = await builder.orderBy('next_renewal_at').execute()
				return { items }
			},
			{
				auth: true,
				query: t.Object({
					status: t.Optional(statusSchema),
					from: t.Optional(t.String()),
					to: t.Optional(t.String()),
					q: t.Optional(t.String()),
				}),
			}
		)
		.post(
			'/subscriptions',
			async ({ user, body }) => {
				const email = user.email as string
				const timestamp = nowIso()
				await ensureDefaultCategory(db, email)
				const nextRenewalDate = parseIso(body.next_renewal_at, 'next_renewal_at')

				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				const settings = await ensureAppUser(db, authUser)

				const rate = await getRateToPrimary(db, settings?.primary_currency ?? null, body.currency)

				const record = {
					id: crypto.randomUUID(),
					owner_email: email,
					name: body.name,
					merchant: body.merchant ?? null,
					amount_cents: body.amount_cents,
					currency: body.currency,
					cadence_unit: body.cadence_unit,
					cadence_count: body.cadence_count,
					next_renewal_at: nextRenewalDate.toISOString(),
					status: 'active' as const,
					category_id: body.category_id ?? null,
					notes: body.notes ?? null,
					created_at: timestamp,
					updated_at: timestamp,
					rate_at_creation: rate,
				}

				await db.insertInto('subscriptions').values(record).execute()

				if (env.EMBEDDINGS_QUEUE && env.VECTORIZE) {
					const text = buildSearchText(record.name, record.merchant)
					const message: EmbeddingMessage = {
						subscriptionId: record.id,
						text,
					}
					await env.EMBEDDINGS_QUEUE.send(message)
				}

				return { item: record }
			},
			{
				auth: true,
				body: t.Object({
					name: t.String({ minLength: 1 }),
					amount_cents: t.Number({ minimum: 0 }),
					currency: t.String({ minLength: 3, maxLength: 3 }),
					cadence_unit: cadenceUnitSchema,
					cadence_count: t.Number({ minimum: 1 }),
					next_renewal_at: t.String(),
					category_id: t.Optional(t.Union([t.String(), t.Null()])),
					merchant: t.Optional(t.String()),
					notes: t.Optional(t.String()),
				}),
			}
		)
		.get(
			'/subscriptions/check-duplicate',
			async ({ user, query }) => {
				const email = user.email as string
				if (!query.name) {
					throw appError.badRequest('Name is required')
				}
				if (!env.VECTORIZE) {
					return { duplicates: [] }
				}
				const authUser = user as { id: string }
				const allowed = consumeRateLimit(`vectorize-duplicate:${authUser.id}`, 20, 60_000)
				if (!allowed) {
					throw appError.tooManyRequests('Duplicate check rate limit exceeded')
				}

				const similarIds = await findSimilarSubscriptions(env.AI, env.VECTORIZE, query.name, 5, 0.8)

				if (similarIds.length === 0) {
					return { duplicates: [] }
				}

				const duplicates = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('owner_email', '=', email)
					.where('id', 'in', similarIds)
					.where('status', '=', 'archived')
					.execute()

				return { duplicates }
			},
			{
				auth: true,
				query: t.Object({
					name: t.String(),
				}),
			}
		)
		.get(
			'/subscriptions/:id',
			async ({ user, params }) => {
				const email = user.email as string
				const item = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()

				if (!item) {
					throw appError.notFound('Subscription not found')
				}

				return { item }
			},
			{ auth: true }
		)
		.put(
			'/subscriptions/:id',
			async ({ user, params, body }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()

				if (!existing) {
					throw appError.notFound('Subscription not found')
				}
				const nextRenewalDate = body.next_renewal_at
					? parseIso(body.next_renewal_at, 'next_renewal_at')
					: null

				const next = {
					name: body.name ?? existing.name,
					merchant: body.merchant ?? existing.merchant,
					amount_cents: body.amount_cents ?? existing.amount_cents,
					currency: body.currency ?? existing.currency,
					cadence_unit: body.cadence_unit ?? existing.cadence_unit,
					cadence_count: body.cadence_count ?? existing.cadence_count,
					next_renewal_at: nextRenewalDate
						? nextRenewalDate.toISOString()
						: existing.next_renewal_at,
					category_id: body.category_id === undefined ? existing.category_id : body.category_id,
					notes: body.notes ?? existing.notes,
					updated_at: nowIso(),
				}

				await db.updateTable('subscriptions').set(next).where('id', '=', params.id).execute()

				const nameOrMerchantChanged =
					next.name !== existing.name || next.merchant !== existing.merchant
				if (nameOrMerchantChanged && env.EMBEDDINGS_QUEUE && env.VECTORIZE) {
					const text = buildSearchText(next.name, next.merchant)
					const message: EmbeddingMessage = {
						subscriptionId: params.id,
						text,
					}
					await env.EMBEDDINGS_QUEUE.send(message)
				}

				return { item: { ...existing, ...next } }
			},
			{
				auth: true,
				body: t.Object({
					name: t.Optional(t.String({ minLength: 1 })),
					amount_cents: t.Optional(t.Number({ minimum: 0 })),
					currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
					cadence_unit: t.Optional(cadenceUnitSchema),
					cadence_count: t.Optional(t.Number({ minimum: 1 })),
					next_renewal_at: t.Optional(t.String()),
					category_id: t.Optional(t.Union([t.String(), t.Null()])),
					merchant: t.Optional(t.String()),
					notes: t.Optional(t.String()),
				}),
			}
		)
		.post(
			'/subscriptions/:id/archive',
			async ({ user, params }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()
				if (!existing) {
					throw appError.notFound('Subscription not found')
				}
				const updated = {
					status: 'archived' as const,
					updated_at: nowIso(),
				}
				await db.updateTable('subscriptions').set(updated).where('id', '=', params.id).execute()
				return { item: { ...existing, ...updated } }
			},
			{ auth: true }
		)
		.post(
			'/subscriptions/:id/pause',
			async ({ user, params }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()
				if (!existing) {
					throw appError.notFound('Subscription not found')
				}
				if (existing.status === 'archived') {
					throw appError.badRequest('Cannot pause archived subscription')
				}
				if (existing.status === 'paused') {
					return { item: existing }
				}
				const updated = {
					status: 'paused' as const,
					updated_at: nowIso(),
				}
				await db.updateTable('subscriptions').set(updated).where('id', '=', params.id).execute()
				return { item: { ...existing, ...updated } }
			},
			{ auth: true }
		)
		.post(
			'/subscriptions/:id/resume',
			async ({ user, params, body }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()
				if (!existing) {
					throw appError.notFound('Subscription not found')
				}
				if (existing.status === 'archived') {
					throw appError.badRequest('Cannot resume archived subscription')
				}
				if (existing.status === 'active') {
					return { item: existing }
				}
				const resumeDate = parseIso(body.next_renewal_at, 'next_renewal_at')
				const updated = {
					status: 'active' as const,
					next_renewal_at: resumeDate.toISOString(),
					updated_at: nowIso(),
				}
				await db.updateTable('subscriptions').set(updated).where('id', '=', params.id).execute()
				return { item: { ...existing, ...updated } }
			},
			{
				auth: true,
				body: t.Object({
					next_renewal_at: t.String(),
				}),
			}
		)
		.post(
			'/subscriptions/:id/restore',
			async ({ user, params, body }) => {
				const email = user.email as string
				const existing = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()
				if (!existing) {
					throw appError.notFound('Subscription not found')
				}
				if (existing.status !== 'archived') {
					return { item: existing }
				}
				const restoreDate = parseIso(body.next_renewal_at, 'next_renewal_at')
				const updated = {
					status: 'active' as const,
					next_renewal_at: restoreDate.toISOString(),
					updated_at: nowIso(),
				}
				await db.updateTable('subscriptions').set(updated).where('id', '=', params.id).execute()
				return { item: { ...existing, ...updated } }
			},
			{
				auth: true,
				body: t.Object({
					next_renewal_at: t.String(),
				}),
			}
		)
		.post(
			'/subscriptions/:id/mark-paid',
			async ({ user, params, body }) => {
				const email = user.email as string
				const subscription = await db
					.selectFrom('subscriptions')
					.selectAll()
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()
				if (!subscription) {
					throw appError.notFound('Subscription not found')
				}

				const authUser = user as {
					id: string
					email: string
					name?: string | null
					image?: string | null
				}
				const settings = await ensureAppUser(db, authUser)

				const occurredAt = body.occurred_at ?? nowIso()
				const occurredDate = parseIso(occurredAt, 'occurred_at')
				const occurredAtIso = occurredDate.toISOString()
				const amount = body.amount_cents ?? subscription.amount_cents
				const overrideDate = body.next_renewal_at
					? parseIso(body.next_renewal_at, 'next_renewal_at')
					: null
				const rate = await getRateToPrimary(db, settings.primary_currency, subscription.currency)

				const event = {
					id: crypto.randomUUID(),
					subscription_id: subscription.id,
					owner_email: email,
					type: 'payment' as const,
					occurred_at: occurredAtIso,
					amount_cents: amount,
					currency: subscription.currency,
					rate_at_event: rate,
					note: body.note ?? null,
				}
				await db.insertInto('subscription_events').values(event).execute()

				const next = advanceRenewal(
					overrideDate ?? new Date(subscription.next_renewal_at),
					subscription.cadence_unit,
					subscription.cadence_count,
					occurredDate
				)

				const updated = {
					next_renewal_at: next.toISOString(),
					updated_at: nowIso(),
				}
				await db
					.updateTable('subscriptions')
					.set(updated)
					.where('id', '=', subscription.id)
					.execute()

				return { item: { ...subscription, ...updated }, event }
			},
			{
				auth: true,
				body: t.Object({
					occurred_at: t.Optional(t.String()),
					amount_cents: t.Optional(t.Number({ minimum: 0 })),
					note: t.Optional(t.String()),
					next_renewal_at: t.Optional(t.String()),
				}),
			}
		)
		.get(
			'/subscriptions/:id/events',
			async ({ user, params }) => {
				const email = user.email as string
				const subscription = await db
					.selectFrom('subscriptions')
					.select(['id'])
					.where('id', '=', params.id)
					.where('owner_email', '=', email)
					.executeTakeFirst()
				if (!subscription) {
					throw appError.notFound('Subscription not found')
				}
				const items = await db
					.selectFrom('subscription_events')
					.selectAll()
					.where('subscription_id', '=', subscription.id)
					.orderBy('occurred_at', 'desc')
					.execute()
				return { items }
			},
			{ auth: true }
		)
}
