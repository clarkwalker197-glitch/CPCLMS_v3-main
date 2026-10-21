# CPC Library motion system

The shared motion tokens and CSS utilities live in `app/globals.css`. They use short, quiet transitions and automatically disable animation for visitors who request reduced motion.

## Patterns

| Pattern | Class or component | Example |
| --- | --- | --- |
| Route entry | `page-route-enter` | Applied by `app/template.tsx` to each route |
| Staggered results | `cpc-stagger-list` on the list parent | Wrap result cards or rows; children enter with a capped 245 ms stagger |
| Book card hover | `cpc-book-card` | Add to a card for a 2 px lift and soft shadow on pointer hover |
| Dialog entry | `cpc-dialog-enter` and `cpc-dialog-backdrop-enter` | Used by `components/ui/dialog.tsx` |
| Button press | `cpc-button-motion` | Included by the shared `Button` in `components/ui/button.tsx` |
| Loading placeholder | `cpc-skeleton` | Used by the shared `Skeleton` and catalog loading placeholders |
| Success / error | `cpc-success-icon` / `cpc-feedback-error` | Use on a success icon or an alert container |

## Applying to results and cards

Put the stagger class on the element that directly contains the results. Apply the card class to interactive cards:

```tsx
<div className="cpc-stagger-list grid gap-4 sm:grid-cols-2">
  {books.map((book) => (
    <article key={book.id} className="cpc-book-card rounded-xl">
      {book.title}
    </article>
  ))}
</div>
```

The CPC catalog already uses these classes for its grid cards and table rows. Stagger delays stop increasing after the seventh item to avoid making long results feel slow.

## Buttons, dialogs, and routes

Use the shared `Button` component for primary actions; its restrained press feedback is automatic. For custom buttons, add `cpc-button-motion`. The shared `Dialog` applies the scale-and-fade entrance and light backdrop blur. Keep route content inside the Next.js route template so it receives the page-entry animation.

Use `cpc-skeleton` for loading placeholders instead of spinners where the content shape is known. For state feedback, retain visible text and semantics (`role="status"` or `role="alert"`); motion is supplementary and must not carry meaning by itself.

## Tokens and accessibility

Tune durations with `--cpc-motion-duration-fast`, `--cpc-motion-duration-standard`, and `--cpc-motion-duration-enter`. Use `--cpc-motion-easing-standard` for entrances and interactions. Keep movement subtle and do not add decorative or looping motion. The global `prefers-reduced-motion: reduce` rules remove entrances and pulses, disable movement, and shorten transitions.
