/**
 * Tiny controlled/uncontrolled state hook for the kit pieces that must know
 * their own value to animate (switch, checkbox, tabs). Radix keeps the same
 * state internally but does not expose it, so the wrapper mirrors it.
 * Used by switch.tsx, checkbox.tsx and segmented-tabs.tsx; copy it with them.
 */
import { useCallback, useRef, useState } from "react";

export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): readonly [T, (next: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChangeRef.current?.(next);
    },
    [controlled],
  );
  return [current, set] as const;
}
