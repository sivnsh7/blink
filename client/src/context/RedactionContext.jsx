import React, { createContext, useContext, useMemo, useReducer, useCallback } from 'react';
import { createRedactionState, redactionReducer } from '../lib/stateMachines.js';

const RedactionContext = createContext({
  redactionMode: true,
  toggleRedactionMode: () => {},
  revealedKeys: new Set(),
  toggleRevealKey: () => {},
  isKeyRevealed: () => false,
});

export function RedactionProvider({ children }) {
  const [state, dispatch] = useReducer(redactionReducer, undefined, createRedactionState);
  const redactionMode = state.mode === 'masked';
  const revealedKeys = state.revealedKeys;

  const toggleRedactionMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_GLOBAL' });
  }, []);

  const toggleRevealKey = useCallback((key) => {
    dispatch({ type: 'TOGGLE_REVEAL', key });
  }, []);

  const isKeyRevealed = useCallback(
    (key) => Boolean(key) && redactionMode && revealedKeys.has(key),
    [redactionMode, revealedKeys]
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
