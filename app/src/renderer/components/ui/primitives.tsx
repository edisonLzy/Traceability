import React from 'react'

type BtnVariant = 'default' | 'primary' | 'danger'
export function Button({
  variant = 'default',
  sm,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; sm?: boolean }) {
  const cls = ['inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-50']
  if (variant === 'primary') cls.push('border-primary bg-primary text-white hover:border-primary-hover hover:bg-primary-hover hover:text-white')
  if (variant === 'danger') cls.push('text-[#e38a8a]')
  if (sm) cls.push('h-7 px-2.5 text-xs')
  cls.push(className)
  return <button className={cls.join(' ')} {...rest} />
}

export function Panel({
  title,
  meta,
  children,
  headExtra,
}: {
  title?: React.ReactNode
  meta?: React.ReactNode
  children: React.ReactNode
  headExtra?: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
      {(title || headExtra) && (
        <div className="flex min-h-12 items-center border-b border-hairline px-4">
          {title && <div className="font-medium">{title}</div>}
          {headExtra}
          {meta && <div className="ml-auto text-xs text-tertiary">{meta}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

const BADGE: Record<string, { cls: string; label: string }> = {
  open: { cls: 'open', label: 'Open' },
  'fix-manual': { cls: 'fixing', label: 'Fix requested' },
  fixing: { cls: 'fixing', label: 'Fixing' },
  fixed: { cls: 'fixed', label: 'Fixed' },
  ignored: { cls: '', label: 'Ignored' },
}
export function Badge({ status, label }: { status: string; label?: string }) {
  const info = BADGE[status] ?? { cls: '', label: 'Ignored' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] text-muted ${info.cls}`}>
      <span className="size-1.5 rounded-full bg-subtle"></span>
      {label ?? info.label}
    </span>
  )
}

export function Modal({
  show,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  show: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  if (!show) return null
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/75 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[#34343a] bg-surface-2" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-subtle">{subtitle}</p>}
        </div>
        <div className="p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3.5">{footer}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs text-muted">{label}</label>
      <input className="h-9 w-full rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none placeholder:text-tertiary focus:border-primary" {...rest} />
    </div>
  )
}
