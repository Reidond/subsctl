export class AppError extends Error {
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

export const appError = {
	unauthorized(message = 'Not authenticated') {
		return new AppError(401, 'UNAUTHORIZED', message)
	},
	forbidden(message = 'Access denied') {
		return new AppError(403, 'FORBIDDEN', message)
	},
	notFound(message = 'Not found') {
		return new AppError(404, 'NOT_FOUND', message)
	},
	badRequest(message = 'Invalid request', details?: unknown) {
		return new AppError(400, 'BAD_REQUEST', message, details)
	},
	tooManyRequests(message = 'Too many requests') {
		return new AppError(429, 'RATE_LIMITED', message)
	},
}
