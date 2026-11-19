import React, { useEffect, useReducer, useRef } from 'react';
import { createGlitchState, glitchReducer } from '../lib/stateMachines.js';

const MX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナ0123456789$#%&<>/\\|+=';
const SCRAMBLE_STEPS = 9;
const STEP_MS = 42;
const HOLD_MS = 100;

export default function DossierHeroTitle({ text = 'BLINK // DOSSIER', as = 'h1' }) {
  const stageRef = useRef(null);
  const [glitch, dispatchGlitch] = useReducer(glitchReducer, undefined, createGlitchState);
  const letters = text.split('');
  const Component = as;

  // 1. High-Performance Pointer Parallax Tilt & 2D Euclidean Proximity Lift (Zero React re-renders)
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (prefersReduced || !finePointer) return;

    let raf = 0;
    let px = 0;
    let py = 0;

    const apply = () => {
      raf = 0;
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;

      const clamp = (v) => Math.max(-0.5, Math.min(0.5, v));
      const nx = clamp((px - (r.left + r.width / 2)) / r.width);
      const ny = clamp((py - (r.top + r.height / 2)) / r.height);

      const ryVal = (nx * 15).toFixed(2);
      const rxVal = (-ny * 10).toFixed(2);

      el.style.setProperty('--rx', `${rxVal}deg`);
      el.style.setProperty('--ry', `${ryVal}deg`);

      // 2D Euclidean Proximity Lift
      const ltrEls = el.querySelectorAll('.ltr');
      ltrEls.forEach((l) => {
        const lr = l.getBoundingClientRect();
        const cx = lr.left + lr.width / 2;
        const cy = lr.top + lr.height / 2;
        const dist = Math.hypot(px - cx, py - cy);
        const isNear = dist < lr.width * 1.25;
        l.classList.toggle('is-near', isNear);
      });
    };

    const onMove = (e) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const reset = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      const el = stageRef.current;
      if (!el) return;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.querySelectorAll('.ltr.is-near').forEach((l) => l.classList.remove('is-near'));
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('blur', reset);
    document.addEventListener('mouseleave', reset);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('blur', reset);
      document.removeEventListener('mouseleave', reset);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 2. Matrix Katakana Scramble Glitch Ambient Loop (explicit phase machine)
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      dispatchGlitch({ type: 'CANCEL' });
      return undefined;
    }

    let cancelled = false;
    let strikeTimeout = null;
    let stepInterval = null;
    let holdTimeout = null;

    const scheduleStrike = (delay) => {
      strikeTimeout = setTimeout(() => {
        strikeTimeout = null;
        if (cancelled) return;

        const validIndices = letters
          .map((character, index) => (character.trim() ? index : -1))
          .filter((index) => index !== -1);

        if (!validIndices.length) {
          scheduleStrike(14000);
          return;
        }

        const targetIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
        const originalChar = letters[targetIdx];
        dispatchGlitch({ type: 'START_STRIKE', idx: targetIdx, originalChar });

        let step = 0;
        stepInterval = setInterval(() => {
          if (cancelled) return;
          step += 1;

          if (step >= SCRAMBLE_STEPS) {
            clearInterval(stepInterval);
            stepInterval = null;
            dispatchGlitch({ type: 'SCRAMBLE_COMPLETE' });
            holdTimeout = setTimeout(() => {
              holdTimeout = null;
              if (!cancelled) dispatchGlitch({ type: 'HOLD_COMPLETE' });
            }, HOLD_MS);
            return;
          }

          dispatchGlitch({
            type: 'SCRAMBLE_TICK',
            char: MX_CHARS[Math.floor(Math.random() * MX_CHARS.length)],
          });
        }, STEP_MS);

        scheduleStrike(14000 + Math.random() * 14000);
      }, delay);
    };

    scheduleStrike(4500);

    return () => {
      cancelled = true;
      if (strikeTimeout) clearTimeout(strikeTimeout);
      if (stepInterval) clearInterval(stepInterval);
      if (holdTimeout) clearTimeout(holdTimeout);
      dispatchGlitch({ type: 'CANCEL' });
    };
  }, [text]);

  return (
    <div className="hero__name">
      <Component className="sr-only">{text}</Component>
      <div
        className="hero__name__stage"
        ref={stageRef}
        aria-hidden="true"
      >
        <span className="hero__name__3d" id="name3d">
          {letters.map((char, i) => {
            if (char === ' ') {
              return (
                <span key={i} style={{ width: '0.4em', display: 'inline-block' }}>
                  &nbsp;
                </span>
              );
            }
            const isGlitching = glitch.idx === i;

            return (
              <span
                key={i}
                className={`ltr ${isGlitching ? 'matrix-strike' : ''}`}
                data-ch={char}
              >
                {isGlitching ? glitch.char || char : char}
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
}
