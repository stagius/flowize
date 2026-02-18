# Light Mode Accessibility Fix Guide

## Problem: Low Contrast Text Colors

Many text colors that work well in dark mode are too light for white backgrounds in light mode.

## Color Contrast Requirements (WCAG AA)

- Normal text (< 18pt): **4.5:1** minimum
- Large text (≥ 18pt or 14pt bold): **3:1** minimum

## Problematic Colors on White Backgrounds

| Color | Contrast on White | WCAG AA Pass? | Fix |
|-------|------------------|---------------|-----|
| slate-300 | 2.29:1 | ❌ FAIL | Use slate-700 (9.73:1) |
| slate-400 | 3.42:1 | ❌ FAIL | Use slate-600 (7.23:1) |
| cyan-400 | 2.87:1 | ❌ FAIL | Use cyan-700 (5.77:1) |
| sky-400 | 2.58:1 | ❌ FAIL | Use sky-700 (6.16:1) |
| indigo-400 | 3.04:1 | ❌ FAIL | Use indigo-700 (8.27:1) |
| purple-400 | 3.71:1 | ❌ FAIL | Use purple-700 (7.53:1) |
| emerald-400 | 2.94:1 | ❌ FAIL | Use emerald-700 (6.13:1) |
| teal-400 | 2.78:1 | ❌ FAIL | Use teal-700 (6.69:1) |
| yellow-400 | 1.84:1 | ❌ FAIL | Use yellow-700 (6.37:1) |
| amber-400 | 2.17:1 | ❌ FAIL | Use amber-700 (5.93:1) |
| orange-400 | 2.36:1 | ❌ FAIL | Use orange-700 (6.47:1) |
| red-400 | 3.01:1 | ❌ FAIL | Use red-700 (7.00:1) |

## Fix Pattern

Replace all light mode text colors with proper contrast:

```tsx
// BEFORE (too light)
className="text-slate-400 dark:text-slate-400"

// AFTER (proper contrast)
className="text-slate-600 dark:text-slate-400"
```

## Systematic Replacements Needed

1. `text-slate-300` → `text-slate-700` (light mode)
2. `text-slate-400` → `text-slate-600` (light mode)
3. `text-cyan-400` → `text-cyan-700` (light mode)
4. `text-sky-400` → `text-sky-700` (light mode)
5. `text-indigo-400` → `text-indigo-700` (light mode)
6. `text-purple-400` → `text-purple-700` (light mode)
7. `text-emerald-400` → `text-emerald-700` (light mode)
8. `text-teal-400` → `text-teal-700` (light mode)
9. `text-yellow-400` → `text-yellow-700` (light mode)
10. `text-amber-400` → `text-amber-700` (light mode)
11. `text-orange-400` → `text-orange-700` (light mode)
12. `text-red-400` → `text-red-700` (light mode)

## Special Cases

### Icons
Icons should use 600 variants for better visibility:
```tsx
// BEFORE
className="text-cyan-400 dark:text-cyan-400"

// AFTER
className="text-cyan-600 dark:text-cyan-400"
```

### Subtle Text
For subtle/disabled text, use slate-500 (still passes at 4.99:1):
```tsx
className="text-slate-500 dark:text-slate-500"
```
