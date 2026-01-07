import { createContext, useContext, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

interface ToastItem {
	id: string
	title: string
	description?: string
	actionLabel?: string
	onAction?: () => void
}

interface ToastContextValue {
	push: (toast: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue>({
	push: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([])

	const push = (toast: Omit<ToastItem, 'id'>) => {
		const id = crypto.randomUUID()
		setToasts((current) => [...current, { ...toast, id }])
		setTimeout(() => {
			setToasts((current) => current.filter((item) => item.id !== id))
		}, 6000)
	}

	const value = useMemo(() => ({ push }), [])

	return (
		<ToastContext.Provider value={value}>
			{children}
			<div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[min(360px,calc(100vw-3rem))] flex-col gap-3">
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className="pointer-events-auto rounded-2xl border border-border bg-card p-4 shadow-lg"
					>
						<div className="text-sm font-semibold text-foreground">{toast.title}</div>
						{toast.description && (
							<div className="mt-1 text-xs text-muted-foreground">{toast.description}</div>
						)}
						{toast.actionLabel && toast.onAction && (
							<Button className="mt-3" size="sm" variant="secondary" onClick={toast.onAction}>
								{toast.actionLabel}
							</Button>
						)}
					</div>
				))}
			</div>
		</ToastContext.Provider>
	)
}

export function useToast() {
	return useContext(ToastContext)
}
