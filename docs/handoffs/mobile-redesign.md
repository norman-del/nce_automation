# Handoff — Mobile Redesign

**Date:** 2026-04-04  
**Status:** PLANNED, NOT YET WRITTEN — start here next session

---

## What was decided this session

The app looks fine on desktop but is broken on mobile:
- Sidebar is always visible (w-56), leaving ~150px for content on a phone
- Every page uses multi-column tables that overflow
- The "Post to QuickBooks" button is in the top-right corner of the header — tiny and hard to reach

**Primary mobile workflow (most important):**
> Payouts list → tap a payout → tap "Post to QuickBooks" → see result

Everything else is secondary.

---

## Design decisions

- **Breakpoint:** `sm` (640px). Below = mobile. Above = desktop unchanged.
- **Navigation:** Fixed bottom tab bar on mobile (4 tabs: Payouts first, Dashboard, Sync Log, Settings). Desktop sidebar unchanged.
- **Payouts list:** Table hidden on mobile, replaced with tappable cards (whole card = link, shows date + net + fees + status pill).
- **Filter pills:** Replace the old attention banner with persistent "All | ⚠ Needs attention" pill toggles (visible on all screen sizes).
- **Payout detail:** "Post to QuickBooks" button becomes a **sticky bar fixed at the bottom of the screen** on mobile (above the tab nav). Always visible, no scrolling needed.
- **Transactions:** 7-column table → cards on mobile (order # + customer + net/fee/gross + QBO status).
- **Dashboard:** Just add `overflow-x-auto` to the recent payouts table — it's not a primary page.

---

## Files to write (6 files, all changes are JSX/CSS only — no logic changes)

### FILE 1: `app/components/AppShell.tsx` — full replacement

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SidebarNav from './SidebarNav'

const tabs = [
  {
    href: '/payouts',
    label: 'Payouts',
    activeWhen: (p: string) => p.startsWith('/payouts'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18.75-9v.75c0 .414.336.75.75.75h.75m-1.5 0V18.75m0-12.75h.375c.621 0 1.125.504 1.125 1.125v.375m0 0H21m0 0v-.375A1.125 1.125 0 0019.875 6H19.5m1.5 12.75H3.75M12 12.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
      </svg>
    ),
  },
  {
    href: '/',
    label: 'Dashboard',
    activeWhen: (p: string) => p === '/',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/sync-log',
    label: 'Log',
    activeWhen: (p: string) => p.startsWith('/sync-log'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    activeWhen: (p: string) => p.startsWith('/settings'),
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') return <>{children}</>

  return (
    <>
      {/* Mobile top header */}
      <header className="sticky top-0 z-40 flex h-12 items-center border-b border-edge bg-surface px-4 sm:hidden">
        <h1 className="text-sm font-semibold text-primary">Fee Sync</h1>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-56 shrink-0 bg-surface border-r border-edge flex-col">
        <div className="px-6 py-5 border-b border-edge">
          <h1 className="text-sm font-semibold text-primary leading-tight">
            Shopify ↔ QBO
            <br />
            <span className="text-secondary font-normal">Fee Sync</span>
          </h1>
        </div>
        <SidebarNav />
        <div className="px-6 py-4 border-t border-edge">
          <p className="text-xs text-secondary">NCE Equipment</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-4 pb-16 bg-canvas sm:p-8 sm:pb-8">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-edge bg-surface sm:hidden">
        {tabs.map((tab) => {
          const active = tab.activeWhen(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-accent' : 'text-secondary hover:text-primary'
              }`}
            >
              {tab.icon}
              <span className="text-[10px]">{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
```

---

### FILE 2: `app/payouts/page.tsx` — targeted changes only

Keep all data fetching/logic. JSX changes:

1. **Header div:** `flex items-center justify-between mb-6` → `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6`

2. **Replace the attention banner block** with persistent filter pills. Remove this:
   ```tsx
   {isAttentionFilter && (
     <div className="mb-4 flex items-center gap-3 ...">...</div>
   )}
   ```
   Add this in its place (before the search form):
   ```tsx
   <div className="flex gap-2 mb-4">
     <Link
       href="/payouts"
       className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
         !isAttentionFilter
           ? 'bg-accent/15 text-accent border border-accent/30'
           : 'bg-overlay text-secondary border border-edge hover:text-primary'
       }`}
     >
       All
     </Link>
     <Link
       href="/payouts?filter=attention"
       className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
         isAttentionFilter
           ? 'bg-warn/15 text-warn border border-warn/30'
           : 'bg-overlay text-secondary border border-edge hover:text-primary'
       }`}
     >
       ⚠ Needs attention
     </Link>
   </div>
   ```

3. **Desktop table:** Wrap the existing `<div className="bg-surface border border-edge rounded-lg overflow-hidden">` in `<div className="hidden sm:block">`.

4. **Add mobile cards** immediately after that hidden wrapper (still inside the `payouts.length > 0` branch):
   ```tsx
   <div className="sm:hidden space-y-2.5">
     {payouts.map((payout: { id: string; payout_date: string; gross_amount: number | null; total_fees: number | null; amount: number; currency: string; sync_status: string }) => {
       const s = statusStyles[payout.sync_status] ?? statusStyles.skipped
       return (
         <Link
           key={payout.id}
           href={`/payouts/${payout.id}`}
           className="block bg-surface border border-edge rounded-xl p-4 active:bg-overlay transition-colors"
         >
           <div className="flex items-center justify-between gap-2 mb-3">
             <span className="font-mono text-primary text-sm">{payout.payout_date}</span>
             <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>
               {s.label}
             </span>
           </div>
           <div className="flex items-baseline gap-5">
             <div>
               <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Net</p>
               <p className="text-lg font-semibold text-primary leading-none">£{Number(payout.amount).toFixed(2)}</p>
             </div>
             <div>
               <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Fees</p>
               <p className="text-base font-medium text-fail leading-none">£{Number(payout.total_fees ?? 0).toFixed(2)}</p>
             </div>
             {payout.gross_amount != null && (
               <div>
                 <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Gross</p>
                 <p className="text-sm text-secondary leading-none">£{Number(payout.gross_amount).toFixed(2)}</p>
               </div>
             )}
           </div>
         </Link>
       )
     })}
   </div>
   ```

---

### FILE 3: `app/payouts/[id]/SyncButton.tsx` — full replacement of return statement

Keep all state (`loading`, `result`, `error`) and `handleSync` function unchanged. Replace only the `return (...)`:

```tsx
return (
  <>
    {/* Desktop: inline in page header */}
    <div className="hidden sm:flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          alreadyPosted
            ? 'bg-warn/15 text-warn border border-warn/30 hover:bg-warn/25'
            : 'bg-accent text-white hover:bg-accent-hi'
        }`}
      >
        {loading ? 'Posting…' : alreadyPosted ? 'Re-post to QuickBooks' : 'Post to QuickBooks'}
      </button>
      {alreadyPosted && !result && !error && (
        <p className="text-xs text-secondary max-w-56 text-right leading-relaxed">
          Already posted. Re-running is safe — items already in QBO will be skipped.
        </p>
      )}
      {error && (
        <div className="w-80 rounded-lg border border-fail/30 bg-fail/10 p-4 text-sm text-fail">
          <p className="font-semibold mb-1">Post failed</p>
          <p>{error}</p>
        </div>
      )}
      {result && (
        <div className={`w-80 rounded-lg border p-4 text-sm ${result.success ? 'border-ok/30 bg-ok/10' : 'border-warn/30 bg-warn/10'}`}>
          <p className={`font-semibold mb-3 ${result.success ? 'text-ok' : 'text-warn'}`}>
            {result.success ? 'Posted to QuickBooks' : 'Posted with issues'}
          </p>
          <div className="mb-3 pb-3 border-b border-edge">
            <p className="text-secondary text-xs uppercase tracking-wide mb-1">Fees journal entry</p>
            {result.journalCreated ? (
              <p className="text-ok text-xs">Created — £{result.totalFees.toFixed(2)} booked to Shopify Charges</p>
            ) : (
              <p className="text-secondary text-xs">Already existed (#{result.journalEntryId})</p>
            )}
          </div>
          <div>
            <p className="text-secondary text-xs uppercase tracking-wide mb-2">Orders</p>
            <ul className="space-y-1.5">
              {result.payments.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-xs">
                  <span className="font-mono text-primary">{p.orderNumber}</span>
                  <span className="text-right">
                    {p.status === 'paid' && <span className="text-ok">Paid £{p.amount.toFixed(2)}</span>}
                    {p.status === 'already_paid' && <span className="text-secondary">Already paid</span>}
                    {p.status === 'no_invoice' && <span className="text-warn">No invoice in QBO</span>}
                    {p.status === 'error' && <span className="text-fail">Error</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-edge">
              <p className="text-fail text-xs font-semibold mb-1">Errors</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-fail text-xs">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Mobile: sticky bottom bar — sits above the bottom tab nav (bottom-16 = 64px tab height) */}
    <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 bg-canvas border-t border-edge px-4 pt-3 pb-4">
      {error && (
        <div className="mb-3 rounded-lg border border-fail/30 bg-fail/10 p-3 text-sm text-fail">
          <p className="font-semibold text-sm mb-0.5">Post failed</p>
          <p className="text-xs">{error}</p>
        </div>
      )}
      {result && (
        <div className={`mb-3 rounded-lg border p-3 ${result.success ? 'border-ok/30 bg-ok/10' : 'border-warn/30 bg-warn/10'}`}>
          <p className={`font-semibold text-sm mb-1.5 ${result.success ? 'text-ok' : 'text-warn'}`}>
            {result.success ? '✓ Posted to QuickBooks' : 'Posted with issues'}
          </p>
          <p className="text-xs text-secondary">
            {result.journalCreated
              ? `Journal created · £${result.totalFees.toFixed(2)} fees booked`
              : `Journal already existed`}
          </p>
          <p className="text-xs text-secondary mt-0.5">
            {result.payments.filter((p) => p.status === 'paid').length} paid
            {result.payments.filter((p) => p.status === 'already_paid').length > 0 &&
              ` · ${result.payments.filter((p) => p.status === 'already_paid').length} already paid`}
            {result.payments.filter((p) => p.status === 'no_invoice').length > 0 &&
              ` · ${result.payments.filter((p) => p.status === 'no_invoice').length} no invoice`}
            {result.errors.length > 0 &&
              ` · ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`}
          </p>
        </div>
      )}
      {alreadyPosted && !result && !error && (
        <p className="text-xs text-secondary mb-2.5 text-center">
          Already posted — re-running is safe, duplicates are skipped.
        </p>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className={`w-full py-4 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          alreadyPosted
            ? 'bg-warn/15 text-warn border border-warn/30 active:bg-warn/25'
            : 'bg-accent text-white active:bg-accent-hi'
        }`}
      >
        {loading ? 'Posting…' : alreadyPosted ? 'Re-post to QuickBooks' : 'Post to QuickBooks'}
      </button>
    </div>
  </>
)
```

---

### FILE 4: `app/payouts/[id]/page.tsx` — targeted changes only

Keep all data fetching. JSX changes:

1. **Header div:** `flex items-start justify-between mb-5` → `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5`

2. **SyncButton in header:** Wrap in `<div className="hidden sm:block">` (desktop only).

3. **After the journal status pill block**, add mobile SyncButton trigger (renders the sticky bar):
   ```tsx
   <div className="sm:hidden">
     <SyncButton payoutId={id} alreadyPosted={payout.sync_status === 'synced'} />
   </div>
   ```

4. **Desktop table:** Wrap `<div className="bg-surface border border-edge rounded-lg overflow-hidden">` in `<div className="hidden sm:block">`.

5. **Add mobile transaction cards** immediately after (inside the `transactions.length > 0` branch):
   ```tsx
   <div className="sm:hidden space-y-2.5">
     <div className="flex items-center justify-between mb-2">
       <p className="text-xs text-secondary">{transactions.length} orders in this payout</p>
       <p className="text-xs text-secondary">{paidCount} of {transactions.length} paid in QBO</p>
     </div>
     {transactions.map((txn) => {
       const s = paymentStatusStyles[txn.payment_status] ?? paymentStatusStyles.no_invoice
       return (
         <div key={txn.id} className="bg-surface border border-edge rounded-xl p-4">
           <div className="flex items-center justify-between gap-2 mb-2">
             <span className="font-mono text-primary text-sm font-medium">{txn.order_number ?? '—'}</span>
             <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${s.pill}`}>{s.label}</span>
           </div>
           <p className="text-sm text-secondary mb-3 truncate">{txn.customer_name ?? txn.company_name ?? '—'}</p>
           <div className="flex gap-5 text-xs">
             <div>
               <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Net</p>
               <p className="text-primary font-semibold">£{Number(txn.net).toFixed(2)}</p>
             </div>
             <div>
               <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Fee</p>
               <p className="text-fail">£{Number(txn.fee).toFixed(2)}</p>
             </div>
             <div>
               <p className="text-[10px] text-secondary uppercase tracking-wide mb-0.5">Gross</p>
               <p className="text-secondary">£{Number(txn.amount).toFixed(2)}</p>
             </div>
           </div>
         </div>
       )
     })}
   </div>
   ```

6. **Bottom spacer** — add before the final closing `</div>`:
   ```tsx
   {/* Spacer so sticky sync button doesn't overlap transactions on mobile */}
   <div className="sm:hidden h-32" />
   ```

---

### FILE 5: `app/page.tsx` (Dashboard) — one-line change

Find:
```tsx
<div className="bg-surface border border-edge rounded-lg overflow-hidden">
```
(the recent payouts table container — the second occurrence, not the chart one)

Change to:
```tsx
<div className="bg-surface border border-edge rounded-lg overflow-x-auto">
```

---

### FILE 6: `app/payouts/SyncPayoutsButton.tsx` — minor width fix

On both the error div and result div, change `max-w-xs` to `w-full sm:max-w-xs` so they don't get clipped on mobile.

---

## What to tell the next session

Paste this exactly:

---

**Read `docs/handoffs/mobile-redesign.md`. It contains the complete plan and all the code for 6 files. Write each file directly using Edit/Write tools (do NOT use Codex — it has had write permission issues). No logic changes — JSX and Tailwind classes only. After writing all 6 files, run `npm run build` to verify no TypeScript errors, then commit.**

Key constraint: the sticky "Post to QuickBooks" bar on the payout detail page sits at `bottom-16` (above the 64px bottom tab nav). The spacer `<div className="sm:hidden h-32" />` at the bottom of the page prevents content being obscured by it.

---

## Why Codex wasn't used

Codex was attempted but the agent call was interrupted by the user after 41 minutes. The previous Codex thread had also had write permission issues ("read-only workspace, apply_patch is blocked"). Write the files directly with Claude's Edit/Write tools — no Codex needed for this task, it's straightforward Tailwind changes.
