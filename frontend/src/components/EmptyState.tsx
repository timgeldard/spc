interface EmptyStateProps {
  message?: string
}

export default function EmptyState({ message = 'No data available for selected filters' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-6xl" aria-hidden="true">[chart]</div>
      <p className="max-w-xs text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}
