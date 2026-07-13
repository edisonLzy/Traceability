// Layout-only utility-class constants that are too unwieldy or too repeated
// to inline. Component styling lives in the ui/ components, not here.

export const pageClass =
  'mx-auto block min-h-full max-w-[1440px] px-4 pt-5.5 pb-15 tablet:px-8 tablet:pt-7'

export const pageHeaderClass = 'mb-7 flex items-start justify-between gap-3.5'

export const pageTitleClass =
  'm-0 text-2xl leading-tight font-semibold tracking-[-0.7px] tablet:text-[28px]'

export const pageSubtitleClass = 'mt-1.5 text-subtle'

export const emptyClass = 'px-5 py-13.5 text-center text-subtle'

export const codeClass =
  'm-0 overflow-auto bg-[#090a0b] px-5 py-4.5 font-mono text-xs leading-7 text-[#c7cbd3]'

// Metric cells form a responsive grid (1 -> 2 -> 4 cols across tablet/desktop)
// whose inner borders must follow the layout at every breakpoint. The border-r
// rules are purely additive (odd cols at tablet, the 2nd col at desktop) so the
// cross-breakpoint cascade never depends on media-query source ordering - a
// different arbitrary nth-child variant per breakpoint would otherwise let a
// smaller breakpoint override a larger one.
export const metricClass =
  'px-5 py-4.5 border-hairline ' +
  'border-b last:border-b-0 tablet:[&:nth-child(3)]:border-b-0 desktop:border-b-0 ' +
  'tablet:[&:nth-child(odd)]:border-r desktop:[&:nth-child(2)]:border-r'

export const metricsGridClass =
  'mb-6 grid grid-cols-1 overflow-hidden rounded-xl border border-hairline bg-surface-1 tablet:grid-cols-2 desktop:grid-cols-4'
