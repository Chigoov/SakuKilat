'use client'

import React, { useRef, useLayoutEffect, forwardRef, useImperativeHandle } from 'react'
import { stripToDigits, formatRupiahLive, calculateCursorPosition, parseAmountInput } from '@/lib/amount'
import { cn } from '@/lib/utils'

export interface RupiahInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string | number
  onChange?: (numericValue: number, formattedString: string) => void
  containerClassName?: string
  prefixClassName?: string
  hidePrefix?: boolean
  prefix?: string
}

export const RupiahInput = forwardRef<HTMLInputElement, RupiahInputProps>(function RupiahInput(
  {
    value,
    onChange,
    containerClassName,
    prefixClassName,
    className,
    hidePrefix = false,
    prefix = 'Rp',
    placeholder = '0',
    disabled,
    onKeyDown,
    ...rest
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  // Cursor tracking ref
  const cursorRef = useRef<{ pos: number | null }>({ pos: null })

  // Compute formatted display value
  const displayValue = React.useMemo(() => {
    if (value === null || value === undefined || value === '') return ''
    if (typeof value === 'number') {
      return value === 0 ? '' : formatRupiahLive(value)
    }
    const str = String(value).trim()
    if (!str) return ''
    // Check if it's already a clean formatted or digit string
    return formatRupiahLive(str)
  }, [value])

  // Restore cursor after re-render if tracked
  useLayoutEffect(() => {
    if (inputRef.current && cursorRef.current.pos !== null) {
      const pos = cursorRef.current.pos
      inputRef.current.setSelectionRange(pos, pos)
      cursorRef.current.pos = null
    }
  }, [displayValue])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value
    const currentCursor = e.target.selectionStart ?? rawInput.length

    // Support natural shortcut like 50k or 1,5jt if typed
    const hasShortcut = /(k|rb|ribu|jt|juta)$/i.test(rawInput.trim().toLowerCase())
    let numeric = 0
    let formatted = ''

    if (hasShortcut) {
      numeric = parseAmountInput(rawInput)
      formatted = formatRupiahLive(numeric)
      cursorRef.current.pos = formatted.length
    } else {
      const digits = stripToDigits(rawInput)
      formatted = formatRupiahLive(digits)
      numeric = digits ? parseInt(digits, 10) : 0
      const nextCursor = calculateCursorPosition(displayValue, formatted, currentCursor)
      cursorRef.current.pos = nextCursor
    }

    if (onChange) {
      onChange(numeric, formatted)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    if (!pastedText) return

    let numeric = 0
    let formatted = ''

    if (/(k|rb|ribu|jt|juta)$/i.test(pastedText.trim().toLowerCase())) {
      numeric = parseAmountInput(pastedText)
      formatted = formatRupiahLive(numeric)
    } else {
      const digits = stripToDigits(pastedText)
      formatted = formatRupiahLive(digits)
      numeric = digits ? parseInt(digits, 10) : 0
    }

    cursorRef.current.pos = formatted.length
    if (onChange) {
      onChange(numeric, formatted)
    }
  }

  return (
    <div
      className={cn(
        'relative flex items-center overflow-hidden transition-all',
        containerClassName
      )}
    >
      {!hidePrefix && (
        <span
          className={cn(
            'text-[var(--sk-text-dim)] font-semibold select-none pointer-events-none pl-3 pr-1 text-sm shrink-0',
            prefixClassName
          )}
          aria-hidden="true"
        >
          {prefix}&nbsp;
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full min-w-0 bg-transparent py-2.5 pr-3 text-[var(--sk-text)] placeholder:text-[var(--sk-text-dim)] outline-none font-medium',
          hidePrefix && 'pl-3',
          className
        )}
        {...rest}
      />
    </div>
  )
})
