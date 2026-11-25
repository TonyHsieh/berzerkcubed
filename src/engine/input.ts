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
    firing: false,
    dodgePressed: false,
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

export function createInputController(canvas: HTMLCanvasElement): InputController {
  const heldKeys = new Set<string>();
  let mouseScreenX = 0;
  let mouseScreenY = 0;
  let firing = false;
  let dodgePressed = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT_CODES.has(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Space' && !heldKeys.has('Space')) {
      dodgePressed = true;
    }
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
      firing = true;
    }
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      firing = false;
    }
  };

  const onBlur = (): void => {
    heldKeys.clear();
    firing = false;
    dodgePressed = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

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
      const swivelDir: -1 | 0 | 1 = qHeld && !eHeld ? -1 : eHeld && !qHeld ? 1 : 0;

      return {
        moveX,
        moveY,
        mouseScreenX,
        mouseScreenY,
        firing,
        dodgePressed,
        swivelDir,
      };
    },

    consumeTransient(): void {
      dodgePressed = false;
    },

    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
    },
  };
}
