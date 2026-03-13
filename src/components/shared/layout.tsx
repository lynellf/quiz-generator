import type { ComponentPropsWithoutRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'

const pageContainerVariants = cva('page-wrap px-4', {
  variants: {
    spacing: {
      default: 'pb-8 pt-14',
      compact: 'py-12',
      state: 'py-10',
    },
  },
  defaultVariants: {
    spacing: 'default',
  },
})

export type PageContainerProps = ComponentPropsWithoutRef<'main'> &
  VariantProps<typeof pageContainerVariants>

export function PageContainer({ className, spacing, ...props }: PageContainerProps) {
  return <main className={cn(pageContainerVariants({ spacing }), className)} {...props} />
}

const islandSectionVariants = cva('rounded-xl border bg-card text-card-foreground shadow-sm', {
  variants: {
    padding: {
      default: 'px-6 py-10 sm:px-10 sm:py-14',
      compact: 'p-6 sm:p-8',
      modal: 'p-6',
    },
    animated: {
      true: 'relative overflow-hidden',
      false: '',
    },
  },
  defaultVariants: {
    padding: 'default',
    animated: true,
  },
})

export type IslandSectionProps = ComponentPropsWithoutRef<'section'> &
  VariantProps<typeof islandSectionVariants>

export function IslandSection({ className, padding, animated, ...props }: IslandSectionProps) {
  return <section className={cn(islandSectionVariants({ padding, animated }), className)} {...props} />
}

const pageHeadingVariants = cva('text-4xl font-semibold tracking-tight text-foreground sm:text-5xl', {
  variants: {
    withMargin: {
      true: 'mb-5 max-w-3xl leading-[1.02]',
      false: '',
    },
  },
  defaultVariants: {
    withMargin: false,
  },
})

type PageHeadingProps = ComponentPropsWithoutRef<'h1'> &
  VariantProps<typeof pageHeadingVariants>

export function PageHeading({ className, withMargin, ...props }: PageHeadingProps) {
  return <h1 className={cn(pageHeadingVariants({ withMargin }), className)} {...props} />
}
