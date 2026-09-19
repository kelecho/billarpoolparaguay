import { useEffect, useRef } from 'react';

/** Updates only decorative transforms; no React renders or perpetual animation loop. */
export function useEmblemParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const emblem = ref.current;
    const scene = emblem?.closest<HTMLElement>('.hero');
    if (!emblem || !scene) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const current = { x: 0, y: 0, scroll: 0 };
    const target = { ...current };
    let visible = true;
    let frame = 0;
    let lastTime = 0;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    function paint() {
      emblem!.style.setProperty('--parallax-x', `${current.x.toFixed(3)}px`);
      emblem!.style.setProperty('--parallax-y', `${current.y.toFixed(3)}px`);
      emblem!.style.setProperty('--parallax-scroll', `${current.scroll.toFixed(3)}px`);
      emblem!.style.setProperty('--parallax-turn', `${(current.scroll * .09 + current.x * .1).toFixed(3)}deg`);
      emblem!.style.setProperty('--parallax-tilt-x', `${(-current.y * .5 + current.scroll * .11).toFixed(3)}deg`);
      emblem!.style.setProperty('--parallax-tilt-y', `${(current.x * .42).toFixed(3)}deg`);
    }

    function animate(time: number) {
      frame = 0;
      const delta = lastTime ? Math.min(time - lastTime, 64) : 16;
      lastTime = time;
      const easing = 1 - Math.exp(-delta / 95);
      let unsettled = false;
      for (const key of ['x', 'y', 'scroll'] as const) {
        current[key] += (target[key] - current[key]) * easing;
        if (Math.abs(target[key] - current[key]) > .015) unsettled = true;
        else current[key] = target[key];
      }
      paint();
      if (unsettled) frame = requestAnimationFrame(animate);
      else lastTime = 0;
    }

    function schedule() {
      if (!frame && visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    }

    function updateScroll() {
      if (!visible || reducedMotion.matches || document.hidden) return;
      const rect = scene!.getBoundingClientRect();
      const distance = Math.max(1, rect.top + window.scrollY + rect.height);
      target.scroll = clamp(window.scrollY / distance, 0, 1) * (finePointer.matches ? 84 : 42);
      schedule();
    }

    function resetPointer() {
      target.x = 0;
      target.y = 0;
      schedule();
    }

    function movePointer(event: PointerEvent) {
      if (!finePointer.matches || reducedMotion.matches || event.pointerType !== 'mouse') return;
      const rect = scene!.getBoundingClientRect();
      target.x = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1) * 34;
      target.y = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1) * 24;
      schedule();
    }

    function updateActivity() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      const active = visible && !document.hidden && !reducedMotion.matches;
      emblem!.dataset.parallax = active ? 'active' : 'paused';
      if (reducedMotion.matches) {
        Object.assign(current, { x: 0, y: 0, scroll: 0 });
        Object.assign(target, current);
        paint();
      } else if (active) {
        resetPointer();
        updateScroll();
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateActivity();
    });
    observer.observe(scene);
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll, { passive: true });
    scene.addEventListener('pointermove', movePointer, { passive: true });
    scene.addEventListener('pointerleave', resetPointer);
    reducedMotion.addEventListener('change', updateActivity);
    finePointer.addEventListener('change', updateActivity);
    document.addEventListener('visibilitychange', updateActivity);
    updateActivity();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
      scene.removeEventListener('pointermove', movePointer);
      scene.removeEventListener('pointerleave', resetPointer);
      reducedMotion.removeEventListener('change', updateActivity);
      finePointer.removeEventListener('change', updateActivity);
      document.removeEventListener('visibilitychange', updateActivity);
    };
  }, []);

  return ref;
}
