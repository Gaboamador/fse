export default function SearchStatus({ ready, statusText, error }) {
  return (
    <>
      <div className="status-line">
        <span className={`dot ${ready ? 'ok' : ''}`} />
        {statusText}
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
