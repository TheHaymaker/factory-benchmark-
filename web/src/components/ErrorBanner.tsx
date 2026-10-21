export function ErrorBanner({ error }: { error: Error | undefined | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="error-banner" data-testid="error-banner">
      {error.message}
    </div>
  );
}
