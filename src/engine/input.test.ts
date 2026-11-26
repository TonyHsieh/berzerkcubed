import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import { createCameraState } from './camera';
import { createDefaultInputState, GAMEPAD_DEADZONE, parseGamepadSnapshot } from './input';
import type { GamepadLike } from './input';
import { createPlayer, updatePlayer } from '../entities/player';
import { createSectorIsland } from '../world/levelData';

function pad(overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    ...overrides,
  };
}

function press(): { pressed: boolean; value: number } {
  return { pressed: true, value: 1 };
}

describe('Gamepad / twin-stick input (W3C Gamepad API)', () => {
  it('filters analog drift inside the deadzone and normalizes beyond it', () => {
    const idle = parseGamepadSnapshot(
      pad({ axes: [0.1, -0.1, 0.05, 0.05] }),
      0.18,
    );
    expect(idle.moveX).toBe(0);
    expect(idle.moveY).toBe(0);
    expect(idle.aimX).toBe(0);
    expect(idle.aimY).toBe(0);
    expect(GAMEPAD_DEADZONE).toBe(0.18);

    const full = parseGamepadSnapshot(pad({ axes: [1, 0, 0, -1] }), 0.18);
    expect(full.moveX).toBe(1);
    expect(full.moveY).toBe(0);
    expect(full.aimX).toBe(0);
    expect(full.aimY).toBe(-1);

    // Deadzone is configurable and applied per-stick, not per-axis.
    const custom = parseGamepadSnapshot(pad({ axes: [0.5, 0, 0, 0] }), 0.5);
    expect(custom.moveX).toBe(0);
  });

  it('maps standard buttons to dodge, swap, fire, slot cycling and camera swivel', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[0] = press(); // A / Cross -> dodge
    buttons[2] = press(); // X / Square -> swap
    buttons[7] = press(); // RT / R2 -> fire
    buttons[13] = press(); // D-pad right -> camera swivel

    const snap = parseGamepadSnapshot(pad({ buttons }));
    expect(snap.dodge).toBe(true);
    expect(snap.swap).toBe(true);
    expect(snap.firing).toBe(true);
    expect(snap.swivelDir).toBe(1);

    // Deflecting the right stick past the deadzone also auto-fires.
    const stickFire = parseGamepadSnapshot(pad({ axes: [0, 0, 0.8, 0] }));
    expect(stickFire.firing).toBe(true);
    expect(stickFire.aimX).toBeGreaterThan(0);
  });

  it('maps LB/RB to previous/next slot and cancels when both are held', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[5] = press();
    expect(parseGamepadSnapshot(pad({ buttons })).slotCycle).toBe(1);
    buttons[5] = { pressed: false, value: 0 };
    buttons[4] = press();
    expect(parseGamepadSnapshot(pad({ buttons })).slotCycle).toBe(-1);
    buttons[5] = press();
    expect(parseGamepadSnapshot(pad({ buttons })).slotCycle).toBe(0);
  });

  it('aims the hero from the right stick without a mouse (headless)', () => {
    const config = createDifficultyConfig();
    const player = createPlayer(0, 0, config);
    const cam = createCameraState();
    const island = createSectorIsland(0);
    const input = createDefaultInputState();
    input.aimX = 1; // stick pushed fully right -> world aim east (90°)
    input.aimY = 0;
    input.firing = true;

    const shots = updatePlayer(player, input, cam, island, config, 1 / 60, []);

    expect(player.aimAngle).toBeCloseTo(90, 3);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].vx).toBeGreaterThan(0);
  });
});
