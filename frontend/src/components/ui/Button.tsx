import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps, ref) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--c-brand)] disabled:cursor-not-allowed disabled:opacity-50'

  const variants = {
    primary: 'bg-[var(--c-brand)] text-white hover:opacity-90 dark:bg-[var(--c-brand)] dark:text-white',
    secondary: 'bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] hover:bg-[var(--c-status-neutral-bg)] dark:hover:bg-[var(--c-status-neutral-bg)] hover:shadow-sm',
    ghost: 'text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-status-neutral-bg)]',
    danger: 'bg-red-600 text-white hover:bg-red-700 hover:shadow-md',
  }

  const sizes = {
    sm: 'h-8 px-3 text-sm rounded-none',
    md: 'h-10 px-4 rounded-none',
    lg: 'h-12 px-6 text-base rounded-none',
  }

  const spinnerSize = size === 'lg' ? 16 : size === 'sm' ? 12 : 14

  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <svg
          width={spinnerSize}
          height={spinnerSize}
          viewBox="0 0 14 14"
          fill="none"
          className="animate-spin"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  )
})
