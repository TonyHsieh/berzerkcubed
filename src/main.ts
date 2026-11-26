import { createDifficultyConfig } from './config/difficulty';
import { createInputController } from './engine/input';
import {
  advanceToNextSector,
  createGameState,
  FIXED_DT,
  spawnBoss,
  stepGameState,
} from './game/gameState';
import { createHud } from './game/hud';
import { createRenderer } from './game/renderer';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

if (canvas) {
  const ctx = canvas.getContext('2d');

  if (ctx) {
    let state = createGameState(createDifficultyConfig());
    const inputController = createInputController(canvas);
    const renderer = createRenderer();

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      state.viewport.width = canvas.width;
      state.viewport.height = canvas.height;
      ctx.imageSmoothingEnabled = false;
    };
    window.addEventListener('resize', resize);
    resize();

    // Initialize Web Audio / Tone.js + VoiceTauntEngine on first user gesture
    const unlockAudio = () => {
      void renderer.initAudio();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    const hud = createHud({
      onSpawnBoss: (kind) => {
        spawnBoss(state, kind);
      },
      onNextSector: () => {
        advanceToNextSector(state);
      },
      onRestart: () => {
        const config = createDifficultyConfig({
          maxMeleeEnforcers: state.config.maxMeleeEnforcers,
          maxShootersAndGrenadiers: state.config.maxShootersAndGrenadiers,
        });
        state = createGameState(config);
        state.viewport.width = canvas.width;
        state.viewport.height = canvas.height;
      },
      onToggleCrt: (enabled) => {
        renderer.vfx.crtEnabled = enabled;
      },
      onToggleMute: (muted) => {
        renderer.sound.muted = muted;
        renderer.voice.muted = muted;
      },
      onToggleBass: (enabled) => {
        renderer.sound.setBassEnabled(enabled);
      },
    });

    let lastTimeMs = performance.now();
    let accumulator = 0;

    const frame = (nowMs: number) => {
      const frameDt = Math.min(0.1, Math.max(0, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;
      accumulator += frameDt;

      while (accumulator >= FIXED_DT) {
        const input = inputController.getState();
        stepGameState(state, input, FIXED_DT);
        renderer.dispatchEvents(state.events, state.camera);
        renderer.update(FIXED_DT, state);
        inputController.consumeTransient();
        accumulator -= FIXED_DT;
      }

      renderer.render(ctx, state, canvas.width, canvas.height);
      hud.update(state);

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}
