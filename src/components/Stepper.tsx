type Props = {
  value: number;
  disabled?: boolean;
  min?: number;
  max?: number;

  /**
   * Step di incremento.
   * Default: 1 (IMPORTANTE: evita salti da 2)
   */
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
  function clamp(n: number) {
    return Math.max(min, Math.min(max, n));
  }

  function dec() {
    if (disabled) return;
    onChange(clamp(value - step));
  }

  function inc() {
    if (disabled) return;
    onChange(clamp(value + step));
  }

  return (
    <div className={`stepper ${disabled ? "stepperDisabled" : ""}`} role="group" aria-label="Quantità">
      <button
        type="button"
        className="stepperBtn"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="Diminuisci"
      >
        −
      </button>

      <div className="stepperValue" aria-label="Valore" aria-live="polite">
        {value}
      </div>

      <button
        type="button"
        className="stepperBtn"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="Aumenta"
      >
        +
      </button>
    </div>
  );
}
