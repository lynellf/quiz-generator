import type { ComponentPropsWithoutRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'
import { Input } from '#/components/ui/input'
import { NativeSelect } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'

const fieldGroupVariants = cva('flex flex-col', {
  variants: {
    gap: {
      none: '',
      sm: 'gap-1',
    },
  },
  defaultVariants: {
    gap: 'none',
  },
})

type FieldGroupProps = ComponentPropsWithoutRef<'label'> &
  VariantProps<typeof fieldGroupVariants>

export function FieldGroup({ className, gap, ...props }: FieldGroupProps) {
  return <label className={cn(fieldGroupVariants({ gap }), className)} {...props} />
}

type FieldLabelProps = ComponentPropsWithoutRef<'span'>

export function FieldLabel({ className, ...props }: FieldLabelProps) {
  return <span className={cn(className)} {...props} />
}

const fieldControlVariants = cva('', {
  variants: {
    size: {
      sm: 'h-7 rounded-[min(var(--radius-md),10px)] py-0.5 text-sm',
      md: '',
    },
    invalid: {
      true: '',
      false: '',
    },
    fullWidth: {
      true: 'w-full',
      false: '',
    },
  },
  defaultVariants: {
    size: 'md',
    invalid: false,
    fullWidth: false,
  },
})

export type FieldControlProps = {
  as?: 'input' | 'select' | 'textarea'
  size?: 'sm' | 'md'
  invalid?: boolean
  fullWidth?: boolean
} & Omit<ComponentPropsWithoutRef<'input'>, 'size'> &
  Omit<ComponentPropsWithoutRef<'select'>, 'size'> &
  Omit<ComponentPropsWithoutRef<'textarea'>, 'size'>

export function FieldControl({
  as = 'input',
  className,
  size,
  invalid,
  fullWidth,
  ...props
}: FieldControlProps) {
  const mergedClassName = cn(fieldControlVariants({ size, invalid, fullWidth }), className)
  const ariaInvalid = invalid || (props as any)['aria-invalid']

  if (as === 'textarea') {
    return (
      <Textarea
        className={mergedClassName}
        aria-invalid={ariaInvalid}
        {...(props as ComponentPropsWithoutRef<'textarea'>)}
      />
    )
  }

  if (as === 'select') {
    return (
      <NativeSelect
        className={mergedClassName}
        size={size === 'sm' ? 'sm' : 'default'}
        aria-invalid={ariaInvalid}
        {...(props as ComponentPropsWithoutRef<'select'>)}
      />
    )
  }

  return (
    <Input
      className={mergedClassName}
      aria-invalid={ariaInvalid}
      {...(props as ComponentPropsWithoutRef<'input'>)}
    />
  )
}

const formGridVariants = cva('grid gap-4', {
  variants: {
    layout: {
      twoCol: 'grid-cols-1 sm:grid-cols-2',
      threeCol: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      twoColDense: 'grid-cols-2',
      threeSm: 'grid-cols-1 sm:grid-cols-3',
    },
  },
  defaultVariants: {
    layout: 'twoCol',
  },
})

type FormGridProps = ComponentPropsWithoutRef<'div'> &
  VariantProps<typeof formGridVariants>

export function FormGrid({ className, layout, ...props }: FormGridProps) {
  return <div className={cn(formGridVariants({ layout }), className)} {...props} />
}

const statusTextVariants = cva('', {
  variants: {
    tone: {
      success: 'text-green-600',
      error: 'text-red-600',
      muted: 'text-sm text-muted-foreground',
    },
  },
  defaultVariants: {
    tone: 'muted',
  },
})

type StatusTextProps = ComponentPropsWithoutRef<'p'> &
  VariantProps<typeof statusTextVariants>

export function StatusText({ className, tone, ...props }: StatusTextProps) {
  return <p className={cn(statusTextVariants({ tone }), className)} {...props} />
}
