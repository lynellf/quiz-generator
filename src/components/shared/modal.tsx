import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'

export function ModalOverlay(props: ComponentPropsWithoutRef<'div'>) {
  const { className, ...rest } = props
  return <div className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/10 p-4 supports-backdrop-filter:backdrop-blur-xs', className)} {...rest} />
}

export function ModalCard(props: ComponentPropsWithoutRef<'div'>) {
  const { className, ...rest } = props
  return <div className={cn('w-full max-w-md rounded-xl border bg-background p-6 text-foreground shadow-lg', className)} {...rest} />
}
