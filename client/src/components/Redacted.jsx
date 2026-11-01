import React, { useId } from 'react';
import { useRedaction } from '../context/RedactionContext';

/**
 * Visual Masking Component ("Field Dossier" Redaction Motif)
 * Masks sensitive host identifiers (hostnames, PIDs, addresses).
 * Global masking always has strict authority over per-item reveals.
 */
export default function Redacted({
  children,
  note = 'CLASSIFIED',
  force = false,
  interactive = true,
  className = '',
  id: explicitId,
}) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const { redactionMode, toggleRevealKey, isKeyRevealed } = useRedaction();

  // If force is true, it is ALWAYS masked and CANNOT be revealed locally
  // Otherwise, if redactionMode is active, it is masked unless explicitly revealed
  const isRevealed = !force && isKeyRevealed(id);
  const isMasked = force || (redactionMode && !isRevealed);

  if (!interactive) {
    if (isMasked) {
      return (
        <span
          className={`redact ${className}`}
          data-note={note}
          aria-hidden="true"
        >
          {children}
        </span>
      );
    }
    return <span className={className}>{children}</span>;
  }

  // When global redaction is turned off and not forced, display children plainly
  if (!redactionMode && !force) {
    return <span className={className}>{children}</span>;
  }

  const handleClick = (e) => {
    e.stopPropagation();
    if (force) return;
    toggleRevealKey(id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (force) return;
      toggleRevealKey(id);
    }
  };

  if (!isMasked) {
    return (
      <button
        type="button"
        className={`redact is-revealed ${className}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        title="Identifier revealed — click or press Space to mask"
        aria-pressed="true"
        aria-label={`Revealed identifier: ${typeof children === 'string' ? children : 'data'}. Click to mask.`}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`redact ${className}`}
      data-note={note}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={force ? `Masked identifier: ${note}` : `Masked identifier: ${note} — click or press Space to reveal`}
      aria-pressed="false"
      aria-label={`Masked identifier: ${note}.${force ? '' : ' Press Space to reveal.'}`}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
