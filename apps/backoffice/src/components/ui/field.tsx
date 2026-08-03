'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { createContext, useContext, useId, useMemo } from 'react'

import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/utils/cn'

type FieldContextValue = {
  id: string
  fieldId: string
  labelId: string
  descriptionId: string
  errorId: string
  invalid?: boolean
  setInvalid?: (invalid: boolean) => void
}

const FieldContext = createContext<FieldContextValue | null>(null)

function useFieldContext() {
  return useContext(FieldContext)
}

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        'flex flex-col gap-6',
        'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className,
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        'mb-2 font-medium',
        'data-[variant=legend]:text-base',
        'data-[variant=label]:text-sm',
        className,
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4',
        className,
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  'group/field flex w-full gap-3 data-[invalid=true]:text-destructive',
  {
    variants: {
      orientation: {
        vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
        horizontal: [
          'flex-row items-center',
          '[&>[data-slot=field-label]]:flex-auto',
          'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
        responsive: [
          'flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto',
          '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
          '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
      },
    },
    defaultVariants: {
      orientation: 'vertical',
    },
  },
)

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
  const id = useId()
  const [invalid, setInvalid] = React.useState(false)
  const contextValue = useMemo(
    () => ({
      id,
      fieldId: `${id}-field`,
      labelId: `${id}-label`,
      descriptionId: `${id}-description`,
      errorId: `${id}-error`,
      invalid,
      setInvalid,
    }),
    [id, invalid],
  )

  return (
    <FieldContext.Provider value={contextValue}>
      <div
        role="group"
        data-slot="field"
        data-orientation={orientation}
        className={cn(fieldVariants({ orientation }), className)}
        {...props}
      />
    </FieldContext.Provider>
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        'group/field-content flex flex-1 flex-col gap-1.5 leading-snug',
        className,
      )}
      {...props}
    />
  )
}

type FieldControlProps = {
  id?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-errormessage'?: string
  'aria-invalid'?: boolean
}

function FieldControl({
  render,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Slot>, 'children'> & {
  render?: (props: FieldControlProps) => React.ReactNode
  children?: React.ReactNode
}) {
  const context = useFieldContext()

  const controlProps: FieldControlProps = {
    id: context?.fieldId,
    'aria-labelledby': context?.labelId,
    'aria-describedby': context?.descriptionId,
    'aria-errormessage': context?.errorId,
    'aria-invalid': context?.invalid || undefined,
  }

  if (render) {
    return <>{render(controlProps)}</>
  }

  return (
    <Slot {...controlProps} {...props}>
      {children}
    </Slot>
  )
}

function FieldLabel({
  className,
  htmlFor,
  id,
  ...props
}: React.ComponentProps<typeof Label>) {
  const context = useFieldContext()

  return (
    <Label
      data-slot="field-label"
      id={id ?? context?.labelId}
      htmlFor={htmlFor ?? context?.fieldId}
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4',
        'has-data-[state=checked]:bg-muted/50',
        className,
      )}
      {...props}
    />
  )
}

function FieldTitle({
  className,
  asAriaLabel = false,
  ...props
}: React.ComponentProps<'div'> & { asAriaLabel?: boolean }) {
  const context = useFieldContext()

  return (
    <div
      data-slot="field-label"
      id={asAriaLabel ? context?.labelId : undefined}
      className={cn(
        'flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function FieldDescription({
  className,
  id,
  ...props
}: React.ComponentProps<'p'>) {
  const context = useFieldContext()

  return (
    <p
      data-slot="field-description"
      id={id ?? context?.descriptionId}
      className={cn(
        'text-muted-foreground text-sm leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance',
        'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5',
        '[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        'relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2',
        className,
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  id,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const context = useFieldContext()
  const hasErrors = !!(children || errors?.some((e) => e?.message))

  // Update the invalid state in the Field context
  React.useEffect(() => {
    context?.setInvalid?.(hasErrors)
  }, [hasErrors, context])

  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>,
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      id={id ?? context?.errorId}
      className={cn('text-destructive text-sm font-normal', className)}
      {...props}
    >
      {content}
    </div>
  )
}

function FieldRequiredIndicator({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span className={cn('text-destructive', className)} aria-hidden {...props}>
      *
    </span>
  )
}

export {
  Field,
  FieldContent,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldRequiredIndicator,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  useFieldContext,
}
