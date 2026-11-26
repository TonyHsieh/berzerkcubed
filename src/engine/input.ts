import type { InputState } from './types';

export interface InputController {
  getState(): InputState;
  consumeTransient(): void;
  destroy(): void;
}

export function createDefaultInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    mouseScreenX: 0,
    mouseScreenY: 0,
    aimX: 0,
    aimY: 0,
    firing: false,
    dodgePressed: false,
    swapPressed: false,
    slotSelect: -1,
    slotCycle: 0,
    swivelDir: 0,
  };
}

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/** Structural subset of the W3C Gamepad interface, so it is testable headlessly. */
export interface GamepadLike {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export interface GamepadSnapshot {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
  dodge: boolean;
  swap: boolean;
  slotCycle: -1 | 0 | 1;
  swivelDir: -1 | 0 | 1;
  /** Milestone 4.15: standard Start / Menu button (button 9). */
  start?: boolean;
  /** Milestone 4.15: true if any gamepad button is currently pressed. */
  anyButtonPressed?: boolean;
}

/** Standard-mapping stick deadzone (Xbox / PlayStation / 8BitDo). */
export const GAMEPAD_DEADZONE = 0.18;

function applyDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (!Number.isFinite(mag) || mag <= deadzone) return { x: 0, y: 0 };
  const scaled = (mag - deadzone) / Math.max(1e-6, 1 - deadzone);
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

/**
 * Pure, side-effect-free W3C Gamepad snapshot parser. Standard mapping:
 * left stick = axes 0/1 (move), right stick = axes 2/3 (aim + auto-fire),
 * A/LT = dodge, X = swap, LB/RB = previous/next slot, D-pad L/R = camera swivel,
 * RT/R2 = fire. Exported so deadzone, aiming and buttons can be tested in Node.
 */
export function parseGamepadSnapshot(
  pad: GamepadLike,
  deadzone: number = GAMEPAD_DEADZONE,
): GamepadSnapshot {
  const dz = Math.min(0.9, Math.max(0, deadzone));
  const left = applyDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, dz);
  const right = applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, dz);

  const down = (index: number): boolean => {
    const button = pad.buttons[index];
    return Boolean(button && (button.pressed || button.value > 0.5));
  };

  const leftBumper = down(4);
  const rightBumper = down(5);
  const dpadLeft = down(12);
  const dpadRight = down(13);
  const start = down(9);
  const anyButtonPressed = pad.buttons.some((b) => Boolean(b && (b.pressed || b.value > 0.5)));

  return {
    moveX: left.x,
    moveY: left.y,
    aimX: right.x,
    aimY: right.y,
    firing: down(7) || right.x !== 0 || right.y !== 0,
    dodge: down(0) || down(6),
    swap: down(2),
    slotCycle: rightBumper && !leftBumper ? 1 : leftBumper && !rightBumper ? -1 : 0,
    swivelDir: dpadRight && !dpadLeft ? 1 : dpadLeft && !dpadRight ? -1 : 0,
    start,
    anyButtonPressed,
  };
}

/** First connected gamepad, copied into a plain structural object (or null). */
function readFirstGamepad(): GamepadLike | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad) return pad;
  }
  return null;
}

export function createInputController(canvas: HTMLCanvasElement): InputController {
  const heldKeys = new Set<string>();
  let mouseScreenX = 0;
  let mouseScreenY = 0;
  let mouseFiring = false;
  let dodgePressed = false;
  let swapRequest = false;
  let slotSelectRequest = -1;
  let wheelCycle: -1 | 0 | 1 = 0;

  // Rising-edge tracking for transient gamepad buttons.
  let prevPadDodge = false;
  let prevPadSwap = false;
  let prevPadCycle: -1 | 0 | 1 = 0;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT_CODES.has(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Space' && !heldKeys.has('Space')) {
      dodgePressed = true;
    }
    if (e.code === 'KeyF' && !heldKeys.has('KeyF')) {
      swapRequest = true;
    }
    if (e.code === 'Digit1') slotSelectRequest = 0;
    if (e.code === 'Digit2') slotSelectRequest = 1;
    if (e.code === 'Digit3') slotSelectRequest = 2;
    heldKeys.add(e.code);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    heldKeys.delete(e.code);
  };

  const onMouseMove = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    mouseScreenX = e.clientX - rect.left;
    mouseScreenY = e.clientY - rect.top;
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      mouseFiring = true;
    }
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      mouseFiring = false;
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    wheelCycle = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
  };

  const onBlur = (): void => {
    heldKeys.clear();
    mouseFiring = false;
    dodgePressed = false;
    swapRequest = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    getState(): InputState {
      let moveX = 0;
      let moveY = 0;

      if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;
      if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;
      if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveY -= 1;
      if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveY += 1;

      const qHeld = heldKeys.has('KeyQ');
      const eHeld = heldKeys.has('KeyE');
      let swivelDir: -1 | 0 | 1 = qHeld && !eHeld ? -1 : eHeld && !qHeld ? 1 : 0;

      // One-shot keyboard requests are consumed on the first poll of the frame.
      const slotSelect = slotSelectRequest;
      let slotCycle: -1 | 0 | 1 = wheelCycle;
      slotSelectRequest = -1;
      wheelCycle = 0;

      let aimX = 0;
      let aimY = 0;
      let firing = mouseFiring;

      // Gamepad inputs seamlessly override / augment keyboard + mouse.
      const pad = readFirstGamepad();
      if (pad) {
        const snap = parseGamepadSnapshot(pad);
        if (snap.moveX !== 0 || snap.moveY !== 0) {
          moveX = snap.moveX;
          moveY = snap.moveY;
        }
        if (snap.aimX !== 0 || snap.aimY !== 0) {
          aimX = snap.aimX;
          aimY = snap.aimY;
        }
        if (snap.firing) firing = true;
        if (snap.dodge && !prevPadDodge) dodgePressed = true;
        if (snap.swap && !prevPadSwap) swapRequest = true;
        if (snap.slotCycle !== 0 && prevPadCycle === 0) slotCycle = snap.slotCycle;
        if (snap.swivelDir !== 0) swivelDir = snap.swivelDir;
        prevPadDodge = snap.dodge;
        prevPadSwap = snap.swap;
        prevPadCycle = snap.slotCycle;
      }

      return {
        moveX,
        moveY,
        mouseScreenX,
        mouseScreenY,
        aimX,
        aimY,
        firing,
        dodgePressed,
        swapPressed: swapRequest,
        slotSelect,
        slotCycle,
        swivelDir,
      };
    },

    consumeTransient(): void {
      dodgePressed = false;
      swapRequest = false;
    },

    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
