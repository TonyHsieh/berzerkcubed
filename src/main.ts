// Milestone 4.1 Fix 1: the boot thermometer is already painted by index.html.
// Only AFTER the module graph resolves do we attach to it and stream real
// bake progress; heavy game modules are imported dynamically so t=0 is never
// a blank black screen.
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

function setInlineBootProgress(fraction: number, label: string): void {
  const fill = document.getElementById('loading-fill');
  const percent = document.getElementById('loading-percent');
  const stage = document.getElementById('loading-stage');
  if (fill) fill.style.height = `${(fraction * 100).toFixed(1)}%`;
  if (percent) percent.textContent = `${Math.round(fraction * 100)}%`;
  if (stage) stage.textContent = label;
}

async function boot(): Promise<void> {
  // Stages 0% -> 25%: engine & audio modules load over the network.
  setInlineBootProgress(0.02, 'LOADING ENGINE MODULES...');
  const [loadingMod, difficultyMod, inputMod, gameStateMod, hudMod, rendererMod] =
    await Promise.all([
      import('./game/loading'),
      import('./config/difficulty'),
      import('./engine/input'),
      import('./game/gameState'),
      import('./game/hud'),
      import('./game/renderer'),
    ]);
  setInlineBootProgress(0.25, 'ENGINE MODULES READY');

  if (!canvas) {
    setInlineBootProgress(1, 'READY');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    setInlineBootProgress(1, 'READY');
    return;
  }

  // createLoadingScreen() reuses the inline #loading-screen from index.html.
  const loading = loadingMod.createLoadingScreen();
  const { models, cache } = await loadingMod.bootstrapAssets((fraction, label) => {
    // Stages 25% -> 92% map onto the real voxel-bake / cache-bake work.
    loading.setProgress(0.25 + fraction * 0.67, label);
  });

  // Stages 92% -> 100%: circuit grid + HUD initialize, then smooth fade-out.
  setInlineBootProgress(0.96, 'INITIALIZING CIRCUIT GRID & HUD');
  loading.finish();

  let state = gameStateMod.createGameState(difficultyMod.createDifficultyConfig());
  const inputController = inputMod.createInputController(canvas);
  const renderer = rendererMod.createRenderer({ models, cache });

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

  const hud = hudMod.createHud({
    onSpawnBoss: (kind) => {
      gameStateMod.spawnBoss(state, kind, { rezDuration: 1.0 });
    },
    onNextSector: () => {
      gameStateMod.advanceToNextSector(state);
    },
    onRestart: () => {
      const config = difficultyMod.createDifficultyConfig({
        maxMeleeEnforcers: state.config.maxMeleeEnforcers,
        maxShootersAndGrenadiers: state.config.maxShootersAndGrenadiers,
      });
      state = gameStateMod.createGameState(config);
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

  // Milestone 4.1 Fix 8: opt-in model gallery / sprite inspector.
  if (new URLSearchParams(window.location.search).get('gallery') === '1') {
    void import('./game/gallery').then(({ createModelGallery }) => {
      createModelGallery({ models, cache });
    });
  }

  let lastTimeMs = performance.now();
  let accumulator = 0;

  const frame = (nowMs: number) => {
    const frameDt = Math.min(0.1, Math.max(0, (nowMs - lastTimeMs) / 1000));
    lastTimeMs = nowMs;
    accumulator += frameDt;

    while (accumulator >= gameStateMod.FIXED_DT) {
      const input = inputController.getState();
      gameStateMod.stepGameState(state, input, gameStateMod.FIXED_DT);
      renderer.dispatchEvents(state.events, state.camera);
      renderer.update(gameStateMod.FIXED_DT, state);
      inputController.consumeTransient();
      accumulator -= gameStateMod.FIXED_DT;
    }

    renderer.render(ctx, state, canvas.width, canvas.height);
    hud.update(state);

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

void boot();
