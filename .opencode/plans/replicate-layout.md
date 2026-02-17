# Plan: Replicate Main Page Layout

## Goal
Replicate the layout, structure, and design of `code2.html` into `app/page.tsx` using Next.js, Tailwind CSS, and Shadcn UI, while preserving existing authentication and pricing logic.

## Context
- Source: `code2.html` (Standalone HTML/Tailwind)
- Target: `app/page.tsx` (Next.js Page)
- Design System: Tailwind CSS + Shadcn UI
- Icons: Lucide React (replacing Material Icons)

## Steps

1.  **Analyze Source & Target**
    - [x] Read `code2.html` to understand structure.
    - [x] Read `app/page.tsx` to identify existing logic (auth redirects, pricing service).

2.  **Implementation (`app/page.tsx`)**
    - [ ] Replace existing JSX structure with `code2.html` sections:
        - **Hero**: "Disponible partout en France" badge, Headline, 3-step process.
        - **Service Cards**: "Camion avec chauffeur" (Blue) and "Main d'oeuvre" (Green) cards.
        - **Features**: "Pourquoi Choisir" grid.
        - **CTA**: Bottom banner with floating "Clients satisfaits" card.
    - [ ] **Icon Replacement**:
        - `local_shipping` -> `Truck`
        - `groups` -> `Users`
        - `check_circle` -> `CheckCircle2`
        - `star` -> `Star`
        - `trending_flat` -> `ArrowRight`
        - `verified_user` -> `ShieldCheck`
        - `schedule` -> `Clock`
        - `savings` -> `PiggyBank`
        - `search` -> `Search`
        - `info` -> `Info`
    - [ ] **Data Integration**:
        - Keep `getUser()` and redirect logic at the top.
        - Keep `getSystemParameters()` for the "Prix fixe" feature.
    - [ ] **Styling**:
        - Ensure `dark:` classes are preserved.
        - Use `bg-primary` and `text-primary` from Tailwind config.

3.  **Verification**
    - [ ] Verify the file compiles (`npm run build` or `npm run lint`).
    - [ ] Visual check (implied by code structure correctness).

## Proposed Code Structure
The `app/page.tsx` file will be rewritten to wrap the new content in `<MainLayout>` and `<main className="bg-background">`.
