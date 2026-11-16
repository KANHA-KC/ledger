# Hisaab — Apple Design Redesign & Next.js App Router

Bilingual (हिंदी / English), offline-first ledger for small businesses, redesigned with **Apple Design System** aesthetics and converted to a **Next.js App Router** architecture optimized for lowest resource consumption.

## Run

You can run commands from the project root or from `app/`:

```bash
# From workspace root:
npm run dev        # http://localhost:3000
npm run build      # production build (Next.js App Router)
npm run start      # production server

# Or inside app directory:
cd app
npm run dev
npm run build
npm run start
```

Demo login: any 10-digit phone number, OTP **123456** (mocked OTP until SMS provider is connected).

---

## What Changed: Apple Design System Redesign

The UI has been redesigned inspired by Apple's Human Interface Guidelines (HIG) and WWDC fluid interfaces principles:

1. **SF Pro Typography & Optical Tracking**:
   - Native system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", system-ui, sans-serif`).
   - Zero-overhead font loading (0kb network payload, instant rendering).
   - Display weights with negative optical letter tracking (`tracking-tight`) on large numbers and positive tracking on small labels.
2. **Materials, Translucency & Vibrancy (Frosted Glass)**:
   - Translucent glass headers (`backdrop-blur-2xl bg-white/80 dark:bg-black/80`).
   - Floating Island iOS bottom navigation dock with Lucide SF-style rounded symbols.
   - macOS-style sidebar with quick add shortcuts on desktop / iPad screens.
3. **Grouped Inset Lists & Apple Cards**:
   - Inset grouped containers (`rounded-2xl border border-black/[0.04] dark:border-white/[0.06] shadow-sm`).
   - Standard iOS hairline separators with content insets.
   - Monogram avatars for parties and accounts.
4. **Apple Segmented Controls**:
   - Tactile sliding pill segmented controls for period selection (`Today`, `Week`, `Month`, `Last Month`, `Custom`), money direction tabs, and language toggles.
5. **Apple Numpad & Direct Manipulation**:
   - Touch response with active scale down (`active:scale-[0.97] active:opacity-85`).
   - Tactile keypad with sub-letters, `+00` and `+000` Indian denomination multipliers, and audio feedback.
   - Apple iOS passcode lock screen with 4 glowing passcode dots and shake animation.
6. **Apple Dynamic Island Floating Toast**:
   - Sleek pill toast at the top of the viewport with animated progress bar and 10-second undo button.
7. **Apple Bottom Sheets & Action Menus**:
   - Native bottom action sheets with top grab handles, backdrop blur scrim, and smooth slide-up presentation.

---

## What Changed: Next.js Migration (Least Resource Consumption)

1. **Next.js App Router (`src/app`)**:
   - Converted from client-side `react-router-dom` to native Next.js App Router routes (`app/page.tsx`, `app/add/[dir]/page.tsx`, `app/entries/page.tsx`, `app/udhaar/page.tsx`, `app/party/[id]/page.tsx`, `app/reports/page.tsx`, `app/wallets/page.tsx`, `app/categories/page.tsx`, `app/more/page.tsx`, `app/bin/page.tsx`).
   - Removed router runtime overhead.
   - Fast static generation: compiles in ~1.3s and serves with minimal memory footprint.
2. **Client-Side Storage Efficiency**:
   - IndexedDB (Dexie) runs entirely client-side, eliminating server CPU, database roundtrips, and memory bottlenecks.
   - Double-entry integer bookkeeping in paise avoids floating-point inaccuracies and high CPU cycles.
3. **Offline & Battery Friendly**:
   - Automatic background relock (2 min inactivity).
   - Minimalist dependency footprint.
