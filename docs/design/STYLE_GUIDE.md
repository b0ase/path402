# $402 Client Design System: "Industrial Pillar"

This document defines the canonical design language for the $402 Desktop Client. All new tabs and components MUST strictly adhere to these guidelines to ensure a unified, premium, and industrial aesthetic.

---

## 1. Core Philosophy: "The Terminal"

The interface should feel like a high-end financial terminal or a sci-fi operating system.
*   **Precision over Comfort:** Sharp edges, high contrast, monospace data.
*   **Function over Decoration:** Every line and border serves a purpose.
*   **Alive & Active:** Use pulsing indicators, real-time data updates, and "system" status messages.
*   **Deep Dark:** The default state is pitch black (`#000000`), not dark grey.

---

## 2. Layout & Structure (The Pillar)

We use a "Pillar" layout philosophy: content is contained in strict, vertical blocks with sharp borders.

*   **Max Width:** `max-w-[1920px]` (Full utilization of large screens).
*   **Padding:** `px-4 md:px-8` (Consistent horizontal breathing room).
*   **Spacing:** `gap-12` (Generous separation between major sections).
*   **Borders:** `border border-zinc-900` (Subtle but defining structural lines).
*   **Corners:** **ALWAYS SHARP.** No `rounded-*` classes allowed, except for circular status dots or user avatars.

### Example Construction
```tsx
<main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
  <header className="mb-16 border-b border-zinc-900 pb-8">
    {/* Page Title */}
  </header>
  <div className="grid lg:grid-cols-3 gap-12">
    {/* Content Pillars */}
  </div>
</main>
```

---

## 3. Typography

We prioritize readability and impact.

### Font Family
*   **Primary:** `font-sans` (Inter/System) for body text and navigation.
*   **Data/Technical:** `font-mono` (JetBrains Mono/Fira Code/Monospace) for numbers, IDs, status, and labels.

### Hierarchy & Style
*   **Page Titles (H1):** `text-4xl md:text-6xl font-black tracking-tighter uppercase`.
    *   _Example:_ `LIBRARY.SYS`, `MARKET.INDEX`
*   **Section Headers (H3):** `text-xs font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-900 pb-2 mb-4`.
*   **Labels:** `text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-zinc-500`.
*   **Data Values:** `font-mono font-bold text-white`.

### Text Colors
*   **Primary:** `text-white` (Headings, active values).
*   **Secondary:** `text-zinc-400` (Body text, descriptions).
*   **Muted:** `text-zinc-600` (Inactive metadata, placeholders).
*   **Accents:** `text-green-500` (Success/Online), `text-red-500` (Error/Offline), `text-zinc-800` (Subtle structural text).

---

## 4. Color Palette

*   **Backgrounds:**
    *   **Base:** `bg-black` (The void).
    *   **Panel:** `bg-zinc-950` (Slightly elevated areas).
    *   **Hover:** `hover:bg-zinc-900`.
*   **Borders:**
    *   **Default:** `border-zinc-900` (Structural dividers).
    *   **Active/Highlight:** `border-zinc-800` or `border-white` (Selected items).
*   **Status Indicators:**
    *   **Green:** `bg-green-500` / `text-green-500` (Online, Active, Secured).
    *   **Pulse:** Use `animate-pulse` on status dots.

---

## 5. Components

### A. Headers
Every page must start with a standardized header block.
```tsx
<header className="mb-16 border-b border-zinc-900 pb-8 flex items-end justify-between">
  <div>
    <div className="flex items-center gap-3 mb-4 text-zinc-500 text-xs tracking-widest uppercase">
      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
      SYSTEM STATUS: ONLINE
    </div>
    <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-2">
      PAGE<span className="text-zinc-800">.NAME</span>
    </h1>
    <p className="text-zinc-500 max-w-lg">
      Brief description of this view's purpose.
    </p>
  </div>
</header>
```

### B. Lists / Indexes
Use strict rows with hover effects for interactive lists.
*   **Container:** `border border-zinc-800 bg-zinc-950/50`.
*   **Item:** `border-b border-zinc-900 hover:bg-zinc-900 transition-all`.
*   **Active Item:** `bg-zinc-900 border-l-2 border-l-white`.

### C. Buttons
Sharp, bold, and mechanical.
*   **Primary:** `bg-white text-black font-bold uppercase tracking-widest hover:bg-zinc-200 text-xs py-3 px-6`.
*   **Secondary:** `border border-zinc-800 text-white font-bold uppercase tracking-widest hover:border-white text-xs py-3 px-6`.

### D. Empty States
Use "System" messaging for empty states.
*   **Icon:** Large ASCII or emoji in `border-2 border-dashed border-zinc-800`.
*   **Text:** `uppercase tracking-widest text-xs`.
*   **Subtext:** `font-mono text-[10px] text-zinc-600`.

---

## 6. Implementation Rules

1.  **NO ROUNDED CORNERS:** Validate that `rounded` classes are removed or set to `rounded-none`, `rounded-full` is ONLY for status dots/avatars.
2.  **Strict Borders:** Content areas should be defined by `1px` borders.
3.  **Monospace Data:** Any number, ID, date, or filesize MUST be `font-mono`.

---

## 7. Motion & Interactivity

The interface should feel mechanical and responsive.

### Page Transitions
Wrap every page content in the standard `<PageTransition>` component.
*   **Effect:** Fast fade-in with a subtle slide-up and scale (`y: 10 -> 0`, `scale: 0.98 -> 1`).
*   **Ease:** `[0.2, 0.0, 0, 1.0]` (Sharp start, smooth landing).

### Hover States
*   **Duration:** `duration-200`.
*   **Feedback:** Borders brighten, backgrounds shift slightly lighter.

---

## 8. Naming Conventions

*   **ACRONYMS:** Always uppercase (e.g., `KYC`, `P2P`, `API`).
*   **TITLES:** ALWAYS UPPERCASE.
    *   ✅ `LIBRARY`
    *   ❌ `Library`
    *   ✅ `$402`
    *   ❌ `Dashboard`
