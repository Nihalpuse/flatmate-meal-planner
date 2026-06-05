/**
 * Fixed pastel backdrop: two large soft blurred shapes the glass refracts.
 * Sits behind all content (-z-10). Colors come from theme tokens.
 */
export function BackgroundField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute -left-20 -top-16 size-72 rounded-full bg-blob-1 opacity-50 blur-[60px]" />
      <div className="absolute -right-20 bottom-24 size-72 rounded-full bg-blob-2 opacity-50 blur-[60px]" />
    </div>
  );
}
