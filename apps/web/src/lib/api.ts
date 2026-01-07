import type { ApiErrorPayload } from './types'

export class ApiError extends Error {
	status: number
	code: string
	details?: unknown

	constructor(status: number, code: string, message: string, details?: unknown) {
		super(message)
		this.status = status
		this.code = code
		this.details = details
	}
}

function isJsonResponse(response: Response) {
	const contentType = response.headers.get('content-type') ?? ''
	return contentType.includes('application/json')
}

async function parseError(response: Response) {
	if (isJsonResponse(response)) {
		const payload = (await response.json()) as ApiErrorPayload
		if (payload?.error) {
			return payload.error
		}
	}
	return {
		code: 'HTTP_ERROR',
		message: response.statusText || 'Request failed',
	}
}

export async function fetchJson<T>(
	input: RequestInfo | URL,
	init: Omit<RequestInit, 'body'> & { body?: unknown } = {}
): Promise<T> {
	const headers = new Headers(init.headers)
	if (!headers.has('content-type') && init.body) {
		headers.set('content-type', 'application/json')
	}

	const response = await fetch(input, {
		...init,
		credentials: 'include',
		headers,
		body:
			init.body && typeof init.body === 'object' && !(init.body instanceof FormData)
				? JSON.stringify(init.body)
				: (init.body as BodyInit | null | undefined),
	})

	if (!response.ok) {
		const error = await parseError(response)
		throw new ApiError(response.status, error.code, error.message, error.details)
	}

	if (response.status === 204) {
		return undefined as T
	}

	if (!isJsonResponse(response)) {
		return (await response.text()) as T
	}

	return (await response.json()) as T
}

export function buildQuery(params: Record<string, string | undefined | null>) {
	const search = new URLSearchParams()
	for (const [key, value] of Object.entries(params)) {
		if (value) {
			search.set(key, value)
		}
	}
	const query = search.toString()
	return query ? `?${query}` : ''
}
