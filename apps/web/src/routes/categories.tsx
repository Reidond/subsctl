import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/skeleton'
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/lib/hooks'
import { useToast } from '@/components/toast'
import { useAuthGuard } from '@/lib/guards'

export const Route = createFileRoute('/categories')({
	component: CategoriesPage,
})

function RenameCategoryButton({
	categoryId,
	name,
	disabled,
}: {
	categoryId: string
	name: string
	disabled: boolean
}) {
	const toast = useToast()
	const mutation = useUpdateCategory(categoryId)

	return (
		<Button
			variant="secondary"
			disabled={disabled}
			onClick={async () => {
				const next = window.prompt('Rename category', name)
				if (!next || next === name) return
				try {
					await mutation.mutateAsync({ name: next })
				} catch (error) {
					console.error(error)
					toast.push({ title: 'Failed to rename category' })
				}
			}}
		>
			Rename
		</Button>
	)
}

function DeleteCategoryButton({ categoryId, disabled }: { categoryId: string; disabled: boolean }) {
	const toast = useToast()
	const mutation = useDeleteCategory(categoryId)

	return (
		<Button
			variant="ghost"
			disabled={disabled}
			onClick={async () => {
				try {
					await mutation.mutateAsync()
				} catch (error) {
					console.error(error)
					toast.push({ title: 'Failed to delete category' })
				}
			}}
		>
			Delete
		</Button>
	)
}

function CategoriesPage() {
	useAuthGuard({ requireOnboarding: true })
	const toast = useToast()
	const { data, isLoading } = useCategories()
	const createCategory = useCreateCategory()
	const [newName, setNewName] = useState('')
	const [newColor, setNewColor] = useState('')

	const handleCreate = async () => {
		if (!newName.trim()) {
			return
		}
		try {
			await createCategory.mutateAsync({
				name: newName,
				color: newColor || undefined,
			})
			setNewName('')
			setNewColor('')
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Failed to create category' })
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Categories</h1>
				<p className="text-sm text-muted-foreground">Group subscriptions with custom labels.</p>
			</div>
			<Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
				<Input
					placeholder="Category name"
					value={newName}
					onChange={(event) => setNewName(event.target.value)}
				/>
				<Input
					placeholder="#1D4ED8"
					value={newColor}
					onChange={(event) => setNewColor(event.target.value)}
				/>
				<Button onClick={handleCreate} disabled={createCategory.isPending}>
					Add
				</Button>
			</Card>
			{isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-12" />
					<Skeleton className="h-12" />
				</div>
			) : data && data.length > 0 ? (
				<div className="space-y-3">
					{data.map((category) => {
						const count = Number(category.subscription_count ?? 0)
						const countLabel = `${count} subscription${count === 1 ? '' : 's'}`
						return (
							<Card
								key={category.id}
								className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
							>
								<div>
									<div className="text-sm font-semibold">{category.name}</div>
									<div className="text-xs text-muted-foreground">
										{category.is_default === 1 ? 'Default category' : 'Custom'} · {countLabel}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<RenameCategoryButton
										categoryId={category.id}
										name={category.name}
										disabled={category.is_default === 1}
									/>
									<DeleteCategoryButton
										categoryId={category.id}
										disabled={category.is_default === 1}
									/>
								</div>
							</Card>
						)
					})}
				</div>
			) : (
				<Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
					No categories yet. Add your first category.
				</Card>
			)}
		</div>
	)
}
