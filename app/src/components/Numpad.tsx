// Big custom number pad for money (never the text keyboard, so no language switching for amounts).
import { useEffect } from 'react'
import { cx } from './ui'

const MAX_DIGITS = 9 // up to ₹99,99,99,999

export function Numpad({ value, onChange, tone }: { value: string; onChange: (v: string) => void; tone: 'in' | 'out' }) {
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1))
    const next = (value === '0' ? '' : value) + k
    if (next.replace(/^0+/, '').length > MAX_DIGITS) return
    onChange(next.replace(/^0+(?=\d)/, ''))
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); press('⌫') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫', '000']
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.slice(0, 12).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          className={cx(
            'min-h-[60px] rounded-2xl text-3xl font-bold active:scale-95',
            k === '⌫' ? (tone === 'in' ? 'bg-aaya-light text-aaya-dark' : 'bg-gaya-light text-gaya-dark') : 'bg-white shadow-sm ring-1 ring-slate-200',
          )}
          aria-label={k === '⌫' ? 'Backspace' : k}
        >
          {k}
        </button>
      ))}
      <button type="button" onClick={() => press('000')} className="col-span-3 min-h-[52px] rounded-2xl bg-white text-2xl font-bold shadow-sm ring-1 ring-slate-200 active:scale-95">
        000
      </button>
    </div>
  )
}
