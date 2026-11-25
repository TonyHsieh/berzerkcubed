// Headless fake canvas for Vitest (no DOM). Records 2D calls; every method is a no-op.
export interface FakeCtx {
  calls: Array<{ fn: string; args: unknown[] }>;
  [k: string]: unknown;
}

export function makeFakeCtx(): FakeCtx {
  const calls: FakeCtx['calls'] = [];
  return new Proxy({ calls } as FakeCtx, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        calls.push({ fn: prop, args });
        return prop === 'createRadialGradient' ? { addColorStop() {} } : undefined;
      };
    },
    set(t, prop: string, v) {
      t[prop] = v;
      return true;
    },
  });
}

export function fakeCanvasFactory(created: HTMLCanvasElement[] = []) {
  return (width: number, height: number): HTMLCanvasElement => {
    const ctx = makeFakeCtx();
    const c = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
    created.push(c);
    return c;
  };
}
