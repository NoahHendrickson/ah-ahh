import { errorMessage } from '../musickit';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="status">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="status error">
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button className="btn ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="status muted">{children}</div>;
}
