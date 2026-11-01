import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

const RedactionContext = createContext({
  redactionMode: true,
  toggleRedactionMode: () => {},
  revealedKeys: new Set(),
  toggleRevealKey: () => {},
  isKeyRevealed: () => false,
});

export function RedactionProvider({ children }) {
  const [redactionMode, setRedactionMode] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState(() => new Set());

  const toggleRedactionMode = useCallback(() => {
    setRedactionMode((prev) => {
      const next = !prev;
      // When re-enabling global masking, immediately purge all per-item reveals
      if (next) {
        setRevealedKeys(new Set());
      }
      return next;
    });
  }, []);

  const toggleRevealKey = useCallback((key) => {
    if (!key) return;
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isKeyRevealed = useCallback(
    (key) => {
      if (!key) return false;
      return revealedKeys.has(key);
    },
    [revealedKeys]
  );

  const value = useMemo(
    () => ({
      redactionMode,
      toggleRedactionMode,
      revealedKeys,
      toggleRevealKey,
      isKeyRevealed,
    }),
    [redactionMode, toggleRedactionMode, revealedKeys, toggleRevealKey, isKeyRevealed]
  );

  return (
    <RedactionContext.Provider value={value}>
      {children}
    </RedactionContext.Provider>
  );
}

export function useRedaction() {
  return useContext(RedactionContext);
}
