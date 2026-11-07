/** Trustbook's mark: an open ledger with a tick. Drawn here, so it needs no image file. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl tracking-tight text-stone-900 ${className}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M3 5.5C3 4.7 3.7 4 4.5 4H11v15H4.5C3.7 19 3 18.3 3 17.5v-12Z" fill="#5b6f00" />
        <path d="M13 4h6.5c.8 0 1.5.7 1.5 1.5v12c0 .8-.7 1.5-1.5 1.5H13V4Z" fill="#d4e85a" />
        <path d="M14.8 11.8l1.6 1.6 3-3.4" fill="none" stroke="#3a4600" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Trustbook
    </span>
  );
}
