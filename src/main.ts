import { DEFAULT_DIFFICULTY } from './config/difficulty';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

if (canvas) {
  const ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('BERZERK³ — Milestone 0 Ready', 32, 56);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px monospace';
      ctx.fillText(
        `Swarm Cap: ${DEFAULT_DIFFICULTY.maxMeleeEnforcers} Melee + ${DEFAULT_DIFFICULTY.maxShootersAndGrenadiers} Ranged`,
        32,
        84,
      );
    }
  };
  window.addEventListener('resize', resize);
  resize();
}
