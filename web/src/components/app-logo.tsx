import { DatabaseBackup } from 'lucide-react'

import { cn } from '@/lib/utils'

interface AppLogoProps {
  className?: string
  size?: 'lg' | 'md' | 'sm'
}

const logoSizeClass: Record<NonNullable<AppLogoProps['size']>, string> = {
  lg: 'size-12 rounded-[15px] shadow-[0_16px_36px_rgba(37,99,235,0.22)]',
  md: 'size-8 rounded-[11px] shadow-[0_10px_24px_rgba(37,99,235,0.18)]',
  sm: 'size-7 rounded-[10px] shadow-[0_8px_18px_rgba(37,99,235,0.16)]'
}

export function AppLogo({ className, size = 'md' }: AppLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground transition-all duration-[250ms]',
        logoSizeClass[size],
        className
      )}
    >
      <DatabaseBackup className={size === 'lg' ? 'size-7' : size === 'md' ? 'size-5' : 'size-4'} />
    </span>
  )
}
