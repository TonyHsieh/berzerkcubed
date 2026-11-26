// Milestone 4.1 Fix 1: the boot thermometer is already painted by index.html.
// Only AFTER the module graph resolves do we attach to it and stream real
// bake progress; heavy game modules are imported dynamically so t=0 is never
// a blank black screen.
import type { GalleryHandle } from './game/gallery';

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

  const galleryMode = new URLSearchParams(window.location.search).get('gallery') === '1';
  let state = gameStateMod.createGameState(difficultyMod.createDifficultyConfig(), {
    initialPhase: galleryMode ? 'playing' : 'title',
  });
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

  let activeGallery: GalleryHandle | null = null;

  const resetToFreshSector1 = (initialPhase: 'title' | 'playing') => {
    const config = difficultyMod.createDifficultyConfig({
      maxMeleeEnforcers: state.config.maxMeleeEnforcers,
      maxShootersAndGrenadiers: state.config.maxShootersAndGrenadiers,
    });
    state = gameStateMod.createGameState(config, { initialPhase });
    state.viewport.width = canvas.width;
    state.viewport.height = canvas.height;
  };

  const launchFromTitle = () => {
    if (state.phase !== 'title') return;
    gameStateMod.startFromTitle(state);
    renderer.sound.setPaused(false);
    void renderer.initAudio().then(() => {
      renderer.sound.fadeInLevelMusic(1.2);
    });
    // Also set mode immediately so headless/pre-init state reflects 'level'
    renderer.sound.fadeInLevelMusic(1.2);
  };

  const handleTogglePause = () => {
    if (activeGallery) return;
    if (state.phase === 'title' || state.gameOver) return;
    const nextPhase = gameStateMod.togglePause(state);
    renderer.sound.setPaused(nextPhase === 'paused');
  };

  // Global keyboard handler for Title Screen "Press Any Button" + Escape Pause toggle
  const onGlobalKeyDown = (e: KeyboardEvent) => {
    if (state.phase === 'title') {
      e.preventDefault();
      launchFromTitle();
      return;
    }
    if (e.code === 'Escape') {
      if (activeGallery) return;
      e.preventDefault();
      handleTogglePause();
    }
  };
  window.addEventListener('keydown', onGlobalKeyDown);

  // Initialize Web Audio / Tone.js + VoiceTauntEngine on first user gesture
  const unlockAudio = () => {
    void renderer.initAudio();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  const openGalleryFromPause = () => {
    if (activeGallery) return;
    void import('./game/gallery').then(({ createModelGallery }) => {
      activeGallery = createModelGallery(
        { models, cache },
        {
          closeLabel: 'BACK TO PAUSE [ESC]',
          onClose: () => {
            activeGallery?.destroy();
            activeGallery = null;
          },
        },
      );
    });
  };

  const doResumeFromPause = () => {
    if (state.phase === 'paused') {
      gameStateMod.resumeGame(state);
      renderer.sound.setPaused(false);
    }
  };

  const doQuitToTitle = () => {
    if (activeGallery) {
      activeGallery.destroy();
      activeGallery = null;
    }
    renderer.sound.setPaused(false);
    renderer.sound.fadeOutMusic(0.6);
    resetToFreshSector1('title');
  };

  const doRestartRun = () => {
    if (activeGallery) {
      activeGallery.destroy();
      activeGallery = null;
    }
    resetToFreshSector1('playing');
    renderer.sound.setPaused(false);
    void renderer.initAudio().then(() => {
      renderer.sound.fadeInLevelMusic(1.2);
    });
    renderer.sound.fadeInLevelMusic(1.2);
  };

  const hud = hudMod.createHud({
    onSpawnBoss: (kind) => {
      gameStateMod.spawnBoss(state, kind, { rezDuration: 1.0 });
      renderer.dispatchEvents(state.events, state.camera);
    },
    onNextSector: () => {
      gameStateMod.advanceToNextSector(state);
    },
    onStartGame: () => {
      launchFromTitle();
    },
    onResume: doResumeFromPause,
    onOpenGallery: openGalleryFromPause,
    onQuitToTitle: doQuitToTitle,
    onRestart: doRestartRun,
    onToggleCrt: (enabled) => {
      renderer.vfx.crtEnabled = enabled;
    },
    onToggleMute: (muted) => {
      renderer.sound.setMuted(muted);
      renderer.voice.muted = muted;
    },
    onToggleBass: (enabled) => {
      renderer.sound.setBassEnabled(enabled);
    },
  });

  // Milestone 4.1 Fix 8: opt-in model gallery / sprite inspector.
  if (galleryMode) {
    void import('./game/gallery').then(({ createModelGallery }) => {
      activeGallery = createModelGallery({ models, cache });
    });
  }

  let lastTimeMs = performance.now();
  let accumulator = 0;
  let prevPadStart = false;
  let prevPadCancel = false;
  let prevPadAny = false;
  const pauseNav = inputMod.createPauseMenuNav();

  const pollGamepadFlowButtons = (dt: number) => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const candidate of pads) {
      if (candidate) {
        pad = candidate;
        break;
      }
    }
    if (!pad) {
      prevPadStart = false;
      prevPadCancel = false;
      prevPadAny = false;
      return;
    }
    const snap = inputMod.parseGamepadSnapshot(pad);
    const startDown = Boolean(snap.start);
    const cancelDown = Boolean(snap.cancel);
    const anyDown = Boolean(snap.anyButtonPressed);
    const navInput = inputMod.gamepadSnapshotToPauseNavInput(snap);

    if (activeGallery) {
      // Milestone 4.16: Start (button 9) or B (button 1) exits Model Gallery back to Pause
      if ((startDown && !prevPadStart) || (cancelDown && !prevPadCancel)) {
        activeGallery.close?.();
        pauseNav.reset(navInput);
      }
      prevPadStart = startDown;
      prevPadCancel = cancelDown;
      prevPadAny = anyDown;
      return;
    }

    if (state.phase === 'title') {
      if (anyDown && !prevPadAny) {
        launchFromTitle();
      }
    } else if (state.phase === 'paused') {
      // Milestone 4.16: Full gamepad navigation in Pause Menu
      const res = pauseNav.poll(navInput, dt);
      hud.setPauseSelection?.(res.selectedIndex);
      if (res.closed) {
        doResumeFromPause();
      } else if (res.activated === 'resume') {
        doResumeFromPause();
      } else if (res.activated === 'restart') {
        doRestartRun();
      } else if (res.activated === 'gallery') {
        openGalleryFromPause();
      } else if (res.activated === 'quit') {
        doQuitToTitle();
      }
    } else if (startDown && !prevPadStart) {
      handleTogglePause();
      pauseNav.reset(navInput);
      hud.setPauseSelection?.(0);
    }

    prevPadStart = startDown;
    prevPadCancel = cancelDown;
    prevPadAny = anyDown;
  };

  const frame = (nowMs: number) => {
    const frameDt = Math.min(0.1, Math.max(0, (nowMs - lastTimeMs) / 1000));
    lastTimeMs = nowMs;

    pollGamepadFlowButtons(frameDt);

    if (state.phase === 'title') {
      // Animate parallax cyber-circuit background smoothly behind Title Screen
      state.camera.x += frameDt * 34;
      state.camera.y += frameDt * 18;
      renderer.circuitBg.update(frameDt);
      accumulator = 0;
    } else if (state.phase === 'paused') {
      // Simulation frozen while paused; drop accumulated time so resume has no jump
      accumulator = 0;
    } else {
      accumulator += frameDt;
      while (accumulator >= gameStateMod.FIXED_DT) {
        const input = inputController.getState();
        gameStateMod.stepGameState(state, input, gameStateMod.FIXED_DT);
        renderer.dispatchEvents(state.events, state.camera);
        renderer.update(gameStateMod.FIXED_DT, state);
        inputController.consumeTransient();
        accumulator -= gameStateMod.FIXED_DT;
      }
    }

    renderer.render(ctx, state, canvas.width, canvas.height);
    hud.update(state);

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

void boot();
