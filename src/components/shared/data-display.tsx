import type { ComponentPropsWithoutRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'
import {
  Table as ShadTable,
  TableCell as ShadTableCell,
  TableHead as ShadTableHead,
  TableRow as ShadTableRow,
} from '#/components/ui/table'

export function Table(props: ComponentPropsWithoutRef<'table'>) {
  const { className, children, ...rest } = props
  return (
    <ShadTable className={cn('text-left', className)} {...rest}>
      {children}
    </ShadTable>
  )
}

const tableHeadCellVariants = cva('', {
  variants: {
    density: {
      default: 'px-4',
      compact: 'h-8 px-2 py-1',
    },
  },
  defaultVariants: {
    density: 'default',
  },
})

type TableHeadCellProps = ComponentPropsWithoutRef<'th'> &
  VariantProps<typeof tableHeadCellVariants>

export function TableHeadCell({ className, density, ...props }: TableHeadCellProps) {
  return <ShadTableHead className={cn(tableHeadCellVariants({ density }), className)} {...props} />
}

const tableCellVariants = cva('', {
  variants: {
    density: {
      default: 'px-4',
      compact: 'p-2',
    },
  },
  defaultVariants: {
    density: 'default',
  },
})

type TableCellProps = ComponentPropsWithoutRef<'td'> &
  VariantProps<typeof tableCellVariants>

export function TableCell({ className, density, ...props }: TableCellProps) {
  return <ShadTableCell className={cn(tableCellVariants({ density }), className)} {...props} />
}

const tableRowVariants = cva('', {
  variants: {
    striped: {
      true: 'even:bg-muted/40',
      false: '',
    },
  },
  defaultVariants: {
    striped: false,
  },
})

type TableRowProps = ComponentPropsWithoutRef<'tr'> &
  VariantProps<typeof tableRowVariants>

export function TableRow({ className, striped, ...props }: TableRowProps) {
  return <ShadTableRow className={cn(tableRowVariants({ striped }), className)} {...props} />
}

export function InlineActions(props: ComponentPropsWithoutRef<'div'>) {
  const { className, ...rest } = props
  return <div className={cn('flex items-center gap-2', className)} {...rest} />
}

export function KeyValueList(props: ComponentPropsWithoutRef<'dl'>) {
  const { className, ...rest } = props
  return <dl className={cn('space-y-2 text-sm', className)} {...rest} />
}

export function KeyValueRow(props: ComponentPropsWithoutRef<'div'>) {
  const { className, ...rest } = props
  return <div className={cn('grid grid-cols-[auto,1fr] gap-x-2', className)} {...rest} />
}
