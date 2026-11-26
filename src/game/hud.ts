import type { BossKind } from '../engine/types';
import { pickupLabel } from '../entities/weapons';
import type { GameState } from './gameState';

export interface HudCallbacks {
  onSpawnBoss?: (kind: BossKind) => void;
  onNextSector?: () => void;
  onRestart?: () => void;
  onToggleCrt?: (enabled: boolean) => void;
  onToggleMute?: (muted: boolean) => void;
  onToggleBass?: (enabled: boolean) => void;
}

export interface HudController {
  update(state: GameState): void;
  toggleTuningPanel(): void;
  isTuningOpen(): boolean;
  destroy(): void;
}

function formatWeaponName(raw: string): string {
  return raw.replace(/_/g, ' ').toUpperCase();
}

export function createHud(
  callbacks: HudCallbacks = {},
  rootElement?: HTMLElement | null,
): HudController {
  if (typeof document === 'undefined') {
    let open = false;
    return {
      update() {
        // Headless no-op
      },
      toggleTuningPanel() {
        open = !open;
      },
      isTuningOpen() {
        return open;
      },
      destroy() {
        // Headless no-op
      },
    };
  }

  let root = rootElement ?? document.getElementById('hud-root');
  let createdRoot = false;
  if (!root) {
    root = document.createElement('div');
    root.id = 'hud-root';
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    document.body.appendChild(root);
    createdRoot = true;
  }

  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;inset:0;pointer-events:none;font-family:ui-monospace,monospace;color:#e2e8f0;padding:14px;';

  // Top-left: Player Vitals
  const vitals = document.createElement('div');
  vitals.style.cssText =
    'position:absolute;top:14px;left:14px;width:240px;background:rgba(5,7,13,0.78);border:1px solid #22d3ee;padding:10px;box-shadow:0 0 12px rgba(34,211,238,0.25);';
  vitals.innerHTML = `
    <div style="font-size:11px;color:#38bdf8;letter-spacing:1px;margin-bottom:6px;display:flex;justify-content:space-between;">
      <span>BERZERK³ UNIT</span>
      <span id="hud-lives">LIVES: 3</span>
    </div>
    <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">SHIELD <span id="hud-shield-val">100</span></div>
    <div style="height:8px;background:#0f172a;border:1px solid #0284c7;margin-bottom:6px;">
      <div id="hud-shield-bar" style="height:100%;width:100%;background:#38bdf8;transition:width 60ms linear;"></div>
    </div>
    <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">HULL HP <span id="hud-hp-val">100</span></div>
    <div style="height:8px;background:#0f172a;border:1px solid #dc2626;margin-bottom:6px;">
      <div id="hud-hp-bar" style="height:100%;width:100%;background:#ef4444;transition:width 60ms linear;"></div>
    </div>
    <div style="font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;">
      <span>DODGE [SPACE]</span>
      <span id="hud-dodge-val" style="color:#4ade80;">READY</span>
    </div>
  `;
  container.appendChild(vitals);

  // Top-center: Boss HP & Multi-Part Status
  const bossBox = document.createElement('div');
  bossBox.style.cssText =
    'position:absolute;top:14px;left:50%;transform:translateX(-50%);width:360px;background:rgba(15,7,13,0.85);border:1px solid #ef4444;padding:10px;display:none;box-shadow:0 0 16px rgba(239,68,68,0.35);';
  bossBox.innerHTML = `
    <div style="font-size:12px;font-weight:bold;color:#f87171;display:flex;justify-content:space-between;margin-bottom:4px;">
      <span id="hud-boss-name">BOSS</span>
      <span id="hud-boss-hp">0 / 0</span>
    </div>
    <div style="height:10px;background:#1f0a10;border:1px solid #ef4444;margin-bottom:6px;">
      <div id="hud-boss-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#ef4444,#f97316);"></div>
    </div>
    <div id="hud-boss-shield-row" style="display:none;font-size:10px;color:#22d3ee;margin-bottom:4px;">
      SHIELD <span id="hud-boss-shield-val">0 / 0</span>
    </div>
    <div id="hud-boss-shield-track" style="display:none;height:7px;background:#08202a;border:1px solid #22d3ee;margin-bottom:6px;position:relative;overflow:hidden;">
      <div id="hud-boss-shield-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#0ea5e9,#fb923c);"></div>
    </div>
    <div id="hud-boss-shield-layers" style="display:none;gap:4px;margin-bottom:6px;"></div>
    <div id="hud-boss-rampage" style="display:none;font-size:12px;font-weight:bold;color:#fef08a;background:rgba(180,30,30,0.65);border:1px solid #facc15;padding:3px 6px;text-align:center;letter-spacing:2px;text-shadow:0 0 10px #f59e0b;margin-bottom:6px;">RAMPAGE — INVULNERABLE!</div>
    <div id="hud-boss-vulnerable" style="display:none;font-size:12px;color:#fef08a;text-align:center;letter-spacing:3px;text-shadow:0 0 10px #facc15;margin-bottom:4px;">VULNERABLE!</div>
    <div id="hud-boss-parts" style="font-size:10px;color:#fca5a5;display:flex;gap:8px;flex-wrap:wrap;"></div>
  `;
  container.appendChild(bossBox);

  // Top-right: Sector, Score, Enemy Count & Tuning Toggle
  const topRight = document.createElement('div');
  topRight.style.cssText =
    'position:absolute;top:14px;right:14px;text-align:right;background:rgba(5,7,13,0.78);border:1px solid #22d3ee;padding:10px;min-width:210px;';
  topRight.innerHTML = `
    <div style="font-size:13px;font-weight:bold;color:#22d3ee;" id="hud-sector">SECTOR 1</div>
    <div style="font-size:12px;color:#facc15;margin-top:2px;">SCORE: <span id="hud-score">0</span></div>
    <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">HOSTILES: <span id="hud-enemies">0</span></div>
    <div id="hud-otto-warn" style="font-size:11px;color:#fde047;margin-top:4px;display:none;">! EVIL OTTO APPROACHING !</div>
    <div id="hud-exit-hint" style="font-size:10px;color:#4ade80;margin-top:4px;display:none;letter-spacing:0.5px;">EXIT DOORS OPEN — WALK THROUGH ANY DOOR</div>
    <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;pointer-events:auto;">
      <button id="hud-tuning-btn" style="background:#0f172a;color:#38bdf8;border:1px solid #38bdf8;padding:4px 8px;font:inherit;font-size:11px;cursor:pointer;">TUNING [TAB]</button>
    </div>
  `;
  container.appendChild(topRight);

  // Bottom-left: Weapon, Level, Modifiers, Orbitals
  const weaponBox = document.createElement('div');
  weaponBox.style.cssText =
    'position:absolute;bottom:14px;left:14px;background:rgba(5,7,13,0.78);border:1px solid #38bdf8;padding:10px;min-width:240px;';
  weaponBox.innerHTML = `
    <div style="font-size:12px;font-weight:bold;color:#38bdf8;" id="hud-weapon-name">PULSE RIFLE LV.1</div>
    <div style="font-size:10px;color:#a78bfa;margin-top:4px;" id="hud-weapon-mods">MODS: NONE</div>
    <div style="font-size:10px;color:#22d3ee;margin-top:2px;" id="hud-orbitals">ORBITALS: 0</div>
    <div style="display:flex;gap:4px;margin-top:6px;" id="hud-weapon-slots"></div>
    <div style="font-size:10px;color:#94a3b8;margin-top:4px;">SLOTS [1/2/3 / WHEEL] · SWAP [F]</div>
    <div style="font-size:11px;color:#facc15;margin-top:6px;display:none;" id="hud-swap-prompt"></div>
  `;
  container.appendChild(weaponBox);

  // Center-bottom pickup / swap toast
  const toastBox = document.createElement('div');
  toastBox.style.cssText =
    'position:absolute;bottom:132px;left:50%;transform:translateX(-50%);background:rgba(5,7,13,0.85);border:1px solid #facc15;padding:6px 14px;display:none;box-shadow:0 0 16px rgba(250,204,21,0.3);';
  toastBox.innerHTML = '<span id="hud-toast-text" style="font-size:13px;color:#facc15;letter-spacing:1px;"></span>';
  container.appendChild(toastBox);

  // Collapsible Designer Tuning Panel
  const tuningPanel = document.createElement('div');
  tuningPanel.style.cssText =
    'position:absolute;top:140px;right:14px;width:270px;background:rgba(5,7,13,0.92);border:1px solid #f59e0b;padding:12px;display:none;pointer-events:auto;box-shadow:0 0 18px rgba(245,158,11,0.3);';
  tuningPanel.innerHTML = `
    <div style="font-size:12px;font-weight:bold;color:#fbbf24;margin-bottom:8px;">DESIGNER TUNING PANEL</div>
    <label style="display:block;font-size:11px;margin-bottom:8px;">
      Max Melee Enforcers: <span id="tune-melee-val">220</span>
      <input id="tune-melee" type="range" min="20" max="350" step="10" value="220" style="width:100%;" />
    </label>
    <label style="display:block;font-size:11px;margin-bottom:8px;">
      Max Shooters/Grenadiers: <span id="tune-ranged-val">75</span>
      <input id="tune-ranged" type="range" min="0" max="120" step="5" value="75" style="width:100%;" />
    </label>
    <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;margin-bottom:10px;">
      <label><input id="tune-crt" type="checkbox" /> CRT Scanlines</label>
      <label><input id="tune-mute" type="checkbox" /> Mute Audio & Voices</label>
      <label><input id="tune-bass" type="checkbox" /> Synthwave Bassline</label>
    </div>
    <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">QUICK BOSS SPAWN</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;">
      <button id="spawn-max" style="background:#7f1d1d;color:#fff;border:1px solid #ef4444;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">Maximilian</button>
      <button id="spawn-rec" style="background:#164e63;color:#fff;border:1px solid #22d3ee;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">Recogniser</button>
      <button id="spawn-otto" style="background:#713f12;color:#fff;border:1px solid #fde047;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">Evil Otto</button>
      <button id="spawn-abb" style="background:#475569;color:#fff;border:1px solid #f97316;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">ABB</button>
      <button id="spawn-skullhead" style="background:#115e59;color:#fff;border:1px solid #facc15;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">Skullhead</button>
      <button id="spawn-bughive" style="background:#1e3a8a;color:#fff;border:1px solid #22d3ee;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">Bug Hive</button>
      <button id="spawn-brainbot" style="background:#14532d;color:#fff;border:1px solid #4ade80;padding:4px 6px;font:inherit;font-size:10px;cursor:pointer;">Brainbot</button>
    </div>
  `;
  container.appendChild(tuningPanel);

  // Game Over Overlay
  const gameOverBox = document.createElement('div');
  gameOverBox.style.cssText =
    'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,7,13,0.72);pointer-events:auto;';
  gameOverBox.innerHTML = `
    <div style="text-align:center;border:2px solid #ef4444;background:#090d18;padding:24px 36px;box-shadow:0 0 24px rgba(239,68,68,0.5);">
      <div style="font-size:28px;font-weight:bold;color:#ef4444;margin-bottom:8px;">GAME OVER</div>
      <div style="font-size:14px;color:#facc15;margin-bottom:16px;" id="hud-final-score">SCORE: 0</div>
      <button id="hud-restart" style="background:#dc2626;color:#fff;border:1px solid #fca5a5;padding:8px 16px;font:inherit;font-size:13px;cursor:pointer;">PLAY AGAIN</button>
    </div>
  `;
  container.appendChild(gameOverBox);

  root.appendChild(container);

  const $ = <T extends HTMLElement>(id: string): T =>
    container.querySelector(`#${id}`) as T;

  const livesEl = $<HTMLSpanElement>('hud-lives');
  const shieldValEl = $<HTMLSpanElement>('hud-shield-val');
  const shieldBarEl = $<HTMLDivElement>('hud-shield-bar');
  const hpValEl = $<HTMLSpanElement>('hud-hp-val');
  const hpBarEl = $<HTMLDivElement>('hud-hp-bar');
  const dodgeValEl = $<HTMLSpanElement>('hud-dodge-val');
  const bossNameEl = $<HTMLSpanElement>('hud-boss-name');
  const bossHpEl = $<HTMLSpanElement>('hud-boss-hp');
  const bossBarEl = $<HTMLDivElement>('hud-boss-bar');
  const bossShieldRowEl = $<HTMLDivElement>('hud-boss-shield-row');
  const bossShieldTrackEl = $<HTMLDivElement>('hud-boss-shield-track');
  const bossShieldValEl = $<HTMLSpanElement>('hud-boss-shield-val');
  const bossShieldBarEl = $<HTMLDivElement>('hud-boss-shield-bar');
  const bossShieldLayersEl = $<HTMLDivElement>('hud-boss-shield-layers');
  const bossRampageEl = $<HTMLDivElement>('hud-boss-rampage');
  const bossVulnerableEl = $<HTMLDivElement>('hud-boss-vulnerable');
  const bossPartsEl = $<HTMLDivElement>('hud-boss-parts');
  const sectorEl = $<HTMLDivElement>('hud-sector');
  const scoreEl = $<HTMLSpanElement>('hud-score');
  const enemiesEl = $<HTMLSpanElement>('hud-enemies');
  const ottoWarnEl = $<HTMLDivElement>('hud-otto-warn');
  const exitHintEl = $<HTMLDivElement>('hud-exit-hint');
  const tuningBtn = $<HTMLButtonElement>('hud-tuning-btn');
  const weaponNameEl = $<HTMLDivElement>('hud-weapon-name');
  const weaponModsEl = $<HTMLDivElement>('hud-weapon-mods');
  const orbitalsEl = $<HTMLDivElement>('hud-orbitals');
  const weaponSlotsEl = $<HTMLDivElement>('hud-weapon-slots');
  const swapPromptEl = $<HTMLDivElement>('hud-swap-prompt');
  const toastContainer = $<HTMLDivElement>('hud-toast-text').parentElement as HTMLDivElement;
  const toastTextEl = $<HTMLSpanElement>('hud-toast-text');
  const meleeSlider = $<HTMLInputElement>('tune-melee');
  const meleeValEl = $<HTMLSpanElement>('tune-melee-val');
  const rangedSlider = $<HTMLInputElement>('tune-ranged');
  const rangedValEl = $<HTMLSpanElement>('tune-ranged-val');
  const crtCheckbox = $<HTMLInputElement>('tune-crt');
  const muteCheckbox = $<HTMLInputElement>('tune-mute');
  const bassCheckbox = $<HTMLInputElement>('tune-bass');
  const spawnMaxBtn = $<HTMLButtonElement>('spawn-max');
  const spawnRecBtn = $<HTMLButtonElement>('spawn-rec');
  const spawnOttoBtn = $<HTMLButtonElement>('spawn-otto');
  const spawnAbbBtn = $<HTMLButtonElement>('spawn-abb');
  const spawnSkullheadBtn = $<HTMLButtonElement>('spawn-skullhead');
  const spawnBugHiveBtn = $<HTMLButtonElement>('spawn-bughive');
  const spawnBrainbotBtn = $<HTMLButtonElement>('spawn-brainbot');
  const finalScoreEl = $<HTMLDivElement>('hud-final-score');
  const restartBtn = $<HTMLButtonElement>('hud-restart');

  let tuningOpen = false;
  let boundState: GameState | null = null;

  const setTuningOpen = (open: boolean) => {
    tuningOpen = open;
    tuningPanel.style.display = tuningOpen ? 'block' : 'none';
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      setTuningOpen(!tuningOpen);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  tuningBtn.addEventListener('click', () => setTuningOpen(!tuningOpen));
  restartBtn.addEventListener('click', () => callbacks.onRestart?.());

  meleeSlider.addEventListener('input', () => {
    const val = Number(meleeSlider.value);
    meleeValEl.textContent = String(val);
    if (boundState) boundState.config.maxMeleeEnforcers = val;
  });

  rangedSlider.addEventListener('input', () => {
    const val = Number(rangedSlider.value);
    rangedValEl.textContent = String(val);
    if (boundState) boundState.config.maxShootersAndGrenadiers = val;
  });

  crtCheckbox.addEventListener('change', () => {
    callbacks.onToggleCrt?.(crtCheckbox.checked);
  });
  muteCheckbox.addEventListener('change', () => {
    callbacks.onToggleMute?.(muteCheckbox.checked);
  });
  bassCheckbox.addEventListener('change', () => {
    callbacks.onToggleBass?.(bassCheckbox.checked);
  });

  spawnMaxBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('maximilian'));
  spawnRecBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('recogniser'));
  spawnOttoBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('evil_otto'));
  spawnAbbBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('abb'));
  spawnSkullheadBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('skullhead'));
  spawnBugHiveBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('bug_hive'));
  spawnBrainbotBtn.addEventListener('click', () => callbacks.onSpawnBoss?.('brainbot'));

  return {
    update(state: GameState): void {
      boundState = state;
      const p = state.player;
      livesEl.textContent = `LIVES: ${p.lives}`;
      shieldValEl.textContent = `${Math.ceil(p.shield)}/${p.maxShield}`;
      shieldBarEl.style.width = `${Math.max(0, Math.min(100, (p.shield / Math.max(1, p.maxShield)) * 100))}%`;
      hpValEl.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
      hpBarEl.style.width = `${Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100))}%`;

      if (p.dodgeTimer > 0) {
        dodgeValEl.textContent = 'ROLLING';
        dodgeValEl.style.color = '#facc15';
      } else if (p.dodgeCooldown > 0) {
        dodgeValEl.textContent = `${p.dodgeCooldown.toFixed(2)}s`;
        dodgeValEl.style.color = '#f97316';
      } else {
        dodgeValEl.textContent = 'READY';
        dodgeValEl.style.color = '#4ade80';
      }

      weaponNameEl.textContent = `${formatWeaponName(p.weapon.primary)} LV.${p.weapon.level}`;
      weaponModsEl.textContent =
        p.weapon.modifiers.length > 0
          ? `MODS: ${p.weapon.modifiers.map(formatWeaponName).join(' + ')}`
          : 'MODS: NONE';
      orbitalsEl.textContent = `ORBITALS: ${p.orbitals.length}`;

      // 3-slot physical weapon inventory + [F] swap prompt
      const slots = p.weaponSlots ?? [p.weapon, null, null];
      const activeSlot = p.activeSlot ?? 0;
      weaponSlotsEl.innerHTML = slots
        .map((slot, i) => {
          const isActive = i === activeSlot;
          const color = isActive ? '#facc15' : slot ? '#38bdf8' : '#475569';
          const name = slot ? formatWeaponName(slot.primary) : 'EMPTY';
          return `<span style="color:${color};border:1px solid ${color};padding:2px 5px;font-size:9px;">${i + 1}:${name}</span>`;
        })
        .join('');

      const near = state.nearbyWeaponPickup;
      if (near) {
        const alreadyCarried = slots.some((s) => s?.primary === near.weaponType);
        const full = slots.every((s) => s !== null);
        const verb = alreadyCarried ? 'UPGRADE' : full ? 'SWAP' : 'EQUIP';
        swapPromptEl.textContent = `[F] ${verb} ${pickupLabel(near)}`;
        swapPromptEl.style.display = 'block';
      } else {
        swapPromptEl.style.display = 'none';
      }

      if (state.toast) {
        toastTextEl.textContent = state.toast.text;
        toastContainer.style.display = 'block';
      } else {
        toastContainer.style.display = 'none';
      }

      sectorEl.textContent = `SECTOR ${state.sectorIndex + 1}`;
      scoreEl.textContent = String(state.score);
      enemiesEl.textContent = String(state.enemies.length);

      ottoWarnEl.style.display = state.ottoWarningActive ? 'block' : 'none';
      exitHintEl.style.display =
        state.bossDefeated && !state.gameOver && !state.roomTransition
          ? 'block'
          : 'none';

      if (state.boss && state.boss.hp > 0) {
        const b = state.boss;
        bossBox.style.display = 'block';
        bossNameEl.textContent = b.reconstructing ? `${b.name} [RECONSTRUCTING]` : b.name;
        bossHpEl.textContent = `${Math.ceil(b.hp)} / ${b.maxHp}`;
        bossBarEl.style.width = `${Math.max(0, Math.min(100, (b.hp / Math.max(1, b.maxHp)) * 100))}%`;

        // Milestone 4.11: blade-shield or higher-sector multi-layer segmented shields + Rampage banner
        const shieldMax = b.shieldMaxHp ?? 0;
        const maxLayers = b.maxShieldLayers ?? 0;
        const curLayers = b.shieldLayers ?? 0;
        const hasShield = shieldMax > 0 || maxLayers > 0;
        bossShieldRowEl.style.display = hasShield ? 'block' : 'none';
        bossShieldTrackEl.style.display = hasShield ? 'block' : 'none';
        if (hasShield) {
          const layerSuffix = maxLayers > 0 ? ` · LAYERS ${curLayers}/${maxLayers}` : '';
          bossShieldValEl.textContent = `${Math.ceil(b.shieldHp ?? 0)} / ${shieldMax}${layerSuffix}`;
          bossShieldBarEl.style.width = `${Math.max(0, Math.min(100, ((b.shieldHp ?? 0) / Math.max(1, shieldMax)) * 100))}%`;
        }
        if (maxLayers > 0) {
          bossShieldLayersEl.style.display = 'flex';
          bossShieldLayersEl.innerHTML = Array.from({ length: maxLayers }, (_, idx) => {
            const active = idx < curLayers;
            const bg = active ? '#22d3ee' : '#1e293b';
            return `<div style="flex:1;height:5px;background:${bg};border:1px solid #0284c7;"></div>`;
          }).join('');
        } else {
          bossShieldLayersEl.style.display = 'none';
        }
        bossRampageEl.style.display = (b.rampageTimer ?? 0) > 0 ? 'block' : 'none';
        bossVulnerableEl.style.display = b.vulnerable && (b.rampageTimer ?? 0) <= 0 ? 'block' : 'none';

        if (b.parts.length > 1) {
          bossPartsEl.innerHTML = b.parts
            .map((part) => {
              const status = part.destroyed
                ? 'DESTROYED'
                : part.vulnerable
                  ? `${Math.ceil(part.hp)}`
                  : 'LOCKED';
              const color = part.destroyed
                ? '#64748b'
                : part.vulnerable
                  ? '#38bdf8'
                  : '#facc15';
              return `<span style="color:${color};">${part.label}: ${status}</span>`;
            })
            .join('');
        } else {
          bossPartsEl.textContent = `PHASE: ${b.phase.toUpperCase()}`;
        }
      } else {
        bossBox.style.display = 'none';
      }

      if (state.gameOver) {
        gameOverBox.style.display = 'flex';
        finalScoreEl.textContent = `FINAL SCORE: ${state.score}`;
      } else {
        gameOverBox.style.display = 'none';
      }
    },

    toggleTuningPanel(): void {
      setTuningOpen(!tuningOpen);
    },

    isTuningOpen(): boolean {
      return tuningOpen;
    },

    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      container.remove();
      if (createdRoot && root) {
        root.remove();
      }
    },
  };
}
