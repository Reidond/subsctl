import type { Env } from './env'

export interface EmbeddingMessage {
	subscriptionId: string
	text: string
}

export interface VectorizeMatch {
	id: string
	score: number
	values?: number[]
	metadata?: Record<string, unknown>
}

export async function generateEmbedding(ai: Ai, text: string): Promise<number[]> {
	const response = (await ai.run('@cf/baai/bge-small-en-v1.5', {
		text: [text],
	})) as { data: number[][] }

	return response.data[0]
}

export async function upsertVectorizeEmbedding(
	vectorize: VectorizeIndex,
	subscriptionId: string,
	embedding: number[]
) {
	await vectorize.upsert([
		{
			id: subscriptionId,
			values: embedding,
			metadata: { subscriptionId },
		},
	])
}

export async function searchVectorize(
	ai: Ai,
	vectorize: VectorizeIndex,
	query: string,
	topK = 10
): Promise<VectorizeMatch[]> {
	const queryEmbedding = await generateEmbedding(ai, query)

	const results = await vectorize.query(queryEmbedding, {
		topK,
		returnValues: false,
		returnMetadata: true,
	})

	return results.matches.map((match) => ({
		id: match.id,
		score: match.score,
		metadata: match.metadata,
	}))
}

export async function findSimilarSubscriptions(
	ai: Ai,
	vectorize: VectorizeIndex,
	name: string,
	topK = 5,
	minScore = 0.8
): Promise<string[]> {
	const matches = await searchVectorize(ai, vectorize, name, topK)

	return matches.filter((match) => match.score >= minScore).map((match) => match.id)
}

export function buildSearchText(name: string, merchant?: string | null): string {
	const parts = [name]
	if (merchant) {
		parts.push(merchant)
	}
	return parts.join(' ')
}
