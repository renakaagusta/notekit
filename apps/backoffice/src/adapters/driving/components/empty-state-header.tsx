interface EmptyStateHeaderProps {
  title: string
  description?: string
}

export function EmptyStateHeader({
  title,
  description,
}: EmptyStateHeaderProps) {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
  )
}
