import { AppLogo } from '@/components/app-logo'

interface BrandMarkProps {
  className?: string
  compact?: boolean
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return <AppLogo className={className} size={compact ? 'md' : 'lg'} />
}
