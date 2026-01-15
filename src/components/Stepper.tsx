
import React from "react";

type Props = {
  value: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
};

export default function Stepper({
  value,
  disabled = false,
  min = 0,
  max = 9999,
  step = 1,
  onChange
}: Props): JSX.Element {
  const valueRef = React.useRef<number>(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const holdDelayRef = React.useRef<number | null>(null);
  const holdIntervalRef = React.useRef<number | null>(null);

  function clamp(n: number) {
    return Math.max(min, Math.min(max, n));
  }

  function apply(next: number) {
    if (disabled) return;
    onChange(clamp(next));
  }

  function clearHold() {
    if (holdDelayRef.current !== null) {
      window.clearTimeout(holdDelayRef.current);
      holdDelayRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }

  function stepOnce(direction: "dec" | "inc") {
    const curr = valueRef.current;
    const next = direction === "dec" ? curr - step : curr + step;
    apply(next);
  }

  function startHold(direction: "dec" | "inc") {
    if (disabled) return;

    // 1 click immediato
    stepOnce(direction);

    // parte il repeat dopo un breve delay
    clearHold();
    holdDelayRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        stepOnce(direction);
      }, 90);
    }, 260);
  }

  React.useEffect(() => {
    return () => clearHold();
  }, []);

  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  return (
    <div className={`stepper ${disabled ? "stepperDisabled" : ""}`} role="group" aria-label="Quantità">
      <button
        type="button"
        className="stepperBtn"
        onClick={() => stepOnce("dec")}
        disabled={!canDec}
        aria-label="Diminuisci"
        onPointerDown={(e) => {
          if (!canDec) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          startHold("dec");
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
      >
        −
      </button>

      <div className="stepperValue" aria-label="Valore" aria-live="polite">
        {value}
      </div>

      <button
        type="button"
        className="stepperBtn"
        onClick={() => stepOnce("inc")}
        disabled={!canInc}
        aria-label="Aumenta"
        onPointerDown={(e) => {
          if (!canInc) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          startHold("inc");
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
      >
        +
      </button>
    </div>
  );
}
