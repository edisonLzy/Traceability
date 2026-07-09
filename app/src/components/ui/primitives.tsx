import React from 'react'

type BtnVariant = 'default' | 'primary' | 'danger'
export function Button({
  variant = 'default',
  sm,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; sm?: boolean }) {
  const cls = ['btn']
  if (variant === 'primary') cls.push('btn-primary')
  if (variant === 'danger') cls.push('btn-danger')
  if (sm) cls.push('btn-sm')
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
    <div className="panel">
      {(title || headExtra) && (
        <div className="panel-head">
          {title && <div className="panel-title">{title}</div>}
          {headExtra}
          {meta && <div className="panel-meta">{meta}</div>}
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
    <span className={`badge ${info.cls}`}>
      <span className="dot"></span>
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
    <div className="modal-backdrop show" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label>{label}</label>
      <input {...rest} />
    </div>
  )
}
