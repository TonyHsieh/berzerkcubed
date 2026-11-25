import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import { createCameraState } from '../engine/camera';
import { createDefaultInputState } from '../engine/input';
import type { EnemyState, GameEvent, Projectile } from '../engine/types';
import { createSectorIsland } from '../world/levelData';
import { addOrbital, getOrbitalWorldPos, updateOrbitals } from './orbitals';
import {
  applyDodgeShove,
  applyPowerUp,
  createPlayer,
  damagePlayer,
  updatePlayer,
} from './player';
import { fireWeapon, MAX_WEAPON_LEVEL } from './weapons';

function makeEnemy(id: string, x: number, y: number, hp = 40): EnemyState {
  return {
    id,
    kind: 'enforcer_melee',
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: 12,
    angle: 0,
    animFrame: 0,
    hp,
    maxHp: hp,
    fireCooldown: 0,
    telegraphTimer: 0,
    freezeTimer: 0,
    hitFlash: 0,
  };
}

describe('Weapons, Leveling & Combining', () => {
  it('levels up duplicate weapon pickups and combines compatible modifiers', () => {
    const config = createDifficultyConfig();
    const player = createPlayer(0, 0, config);
    const events: GameEvent[] = [];

    // Switch to spread shot
    applyPowerUp(player, {
      id: 'p1',
      x: 0,
      y: 0,
      z: 0,
      kind: 'weapon',
      weaponType: 'spread',
      life: 10,
    });
    expect(player.weapon.primary).toBe('spread');
    expect(player.weapon.level).toBe(1);

    const lvl1Shots = fireWeapon(player, events);
    expect(lvl1Shots).toHaveLength(3);

    // Duplicate pickup levels up spread shot -> more pellets & higher damage
    applyPowerUp(player, {
      id: 'p2',
      x: 0,
      y: 0,
      z: 0,
      kind: 'weapon',
      weaponType: 'spread',
      life: 10,
    });
    expect(player.weapon.level).toBe(2);

    // Combine with lightning_chain + freeze modifiers
    applyPowerUp(player, {
      id: 'p3',
      x: 0,
      y: 0,
      z: 0,
      kind: 'modifier',
      modifier: 'lightning_chain',
      life: 10,
    });
    applyPowerUp(player, {
      id: 'p4',
      x: 0,
      y: 0,
      z: 0,
      kind: 'modifier',
      modifier: 'freeze',
      life: 10,
    });

    const lvl2Shots = fireWeapon(player, events);
    expect(lvl2Shots.length).toBeGreaterThan(lvl1Shots.length);
    expect(lvl2Shots[0].damage).toBeGreaterThan(lvl1Shots[0].damage);
    expect(lvl2Shots[0].modifiers).toContain('lightning_chain');
    expect(lvl2Shots[0].modifiers).toContain('freeze');
    expect(lvl2Shots[0].bouncesLeft).toBeGreaterThanOrEqual(2);

    // Caps at MAX_WEAPON_LEVEL
    for (let i = 0; i < 10; i++) {
      applyPowerUp(player, {
        id: `cap_${i}`,
        x: 0,
        y: 0,
        z: 0,
        kind: 'weapon',
        weaponType: 'spread',
        life: 10,
      });
    }
    expect(player.weapon.level).toBe(MAX_WEAPON_LEVEL);
  });

  it('supports grenades with Z-arc and stationary drop mines', () => {
    const config = createDifficultyConfig();
    const player = createPlayer(0, 0, config);
    const events: GameEvent[] = [];

    applyPowerUp(player, {
      id: 'g1',
      x: 0,
      y: 0,
      z: 0,
      kind: 'weapon',
      weaponType: 'grenade',
      life: 10,
    });
    const grenades = fireWeapon(player, events);
    expect(grenades).toHaveLength(1);
    expect(grenades[0].kind).toBe('grenade');
    expect(grenades[0].vz).toBeGreaterThan(0);
    expect(grenades[0].targetX).toBeDefined();

    applyPowerUp(player, {
      id: 'm1',
      x: 0,
      y: 0,
      z: 0,
      kind: 'weapon',
      weaponType: 'mine',
      life: 10,
    });
    const mines = fireWeapon(player, events);
    expect(mines).toHaveLength(1);
    expect(mines[0].kind).toBe('mine');
    expect(mines[0].vx).toBe(0);
    expect(mines[0].vy).toBe(0);
  });
});

describe('Hero Survivability, Dodge-Roll & Orbitals', () => {
  it('absorbs damage with regenerating energy shield before HP', () => {
    const config = createDifficultyConfig();
    const island = createSectorIsland(0);
    const cam = createCameraState();
    const player = createPlayer(0, 0, config);
    const events: GameEvent[] = [];

    damagePlayer(player, 60, config, events);
    expect(player.shield).toBe(40);
    expect(player.hp).toBe(100);
    expect(player.shieldRegenDelay).toBe(config.shieldRegenDelaySec);

    // Advance past shieldRegenDelaySec and verify regeneration
    updatePlayer(
      player,
      createDefaultInputState(),
      cam,
      island,
      config,
      config.shieldRegenDelaySec + 1.0,
      events,
    );
    expect(player.shield).toBeGreaterThan(40);
  });

  it('grants dodge-roll i-frames and radial knockback shove against nearby enemies', () => {
    const config = createDifficultyConfig();
    const island = createSectorIsland(0);
    const cam = createCameraState();
    const player = createPlayer(0, 0, config);
    const events: GameEvent[] = [];

    const input = createDefaultInputState();
    input.moveX = 1;
    input.dodgePressed = true;

    updatePlayer(player, input, cam, island, config, 0.016, events);
    expect(player.dodgeTimer).toBeGreaterThan(0);

    // Damage is ignored during dodge-roll i-frames
    const tookHit = damagePlayer(player, 50, config, events);
    expect(tookHit).toBe(false);
    expect(player.shield).toBe(config.playerMaxShield);

    // Nearby enemies get radially shoved away
    const nearEnemy = makeEnemy('near', player.x + 30, player.y);
    const farEnemy = makeEnemy('far', player.x + 300, player.y);
    const shoved = applyDodgeShove(player, [nearEnemy, farEnemy], config);
    expect(shoved).toBe(1);
    expect(nearEnemy.vx).toBeGreaterThan(0);
    expect(farEnemy.vx).toBe(0);
  });

  it('updates stackable shooter drones, lightsabers, and ablative shields', () => {
    const config = createDifficultyConfig();
    const player = createPlayer(0, 0, config);
    const events: GameEvent[] = [];

    const drone = addOrbital(player, 'shooter_drone');
    const saber = addOrbital(player, 'lightsaber');
    const shield = addOrbital(player, 'ablative_shield');
    // Offset shield to opposite side so lightsaber doesn't intercept the shield's test bolt
    shield.orbitAngle = Math.PI;

    // Place enemy in drone range and another overlapping lightsaber after small step
    const farTarget = makeEnemy('target', 180, 0, 50);
    const saberPos = getOrbitalWorldPos(player, saber);
    const meleeTarget = makeEnemy('melee', saberPos.x, saberPos.y, 40);

    const shieldPos = getOrbitalWorldPos(player, shield);
    const enemyBolt: Projectile = {
      id: 'eb_1',
      owner: 'enemy',
      kind: 'bolt',
      x: shieldPos.x,
      y: shieldPos.y,
      z: 16,
      vx: -100,
      vy: 0,
      vz: 0,
      radius: 5,
      damage: 20,
      life: 1,
      maxLife: 1,
      bouncesLeft: 0,
      modifiers: [],
      color: '#ef4444',
    };

    const droneShots = updateOrbitals(
      player,
      [farTarget, meleeTarget],
      [enemyBolt],
      0.016,
      events,
    );

    expect(drone.orbitAngle).toBeGreaterThan(0);
    expect(droneShots).toHaveLength(1);
    expect(droneShots[0].owner).toBe('player');
    expect(meleeTarget.hp).toBeLessThan(40);
    expect(enemyBolt.life).toBe(0);
    expect(shield.hp).toBe(30);
  });
});
