import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string | undefined
  hint?: string
  /** Renders the label visually hidden (still announced by screen readers). */
  hideLabel?: boolean
}

export function TextField({
  label,
  error,
  hint,
  hideLabel = false,
  required,
  className,
  ...rest
}: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  const classes = ['input', error ? 'input-invalid' : '', className].filter(Boolean).join(' ')

  return (
    <div className="field">
      <label className={hideLabel ? 'label sr-only' : 'label'} htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="required-mark">
            {' *'}
          </span>
        ) : null}
      </label>
      <input
        {...rest}
        id={id}
        required={required}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
