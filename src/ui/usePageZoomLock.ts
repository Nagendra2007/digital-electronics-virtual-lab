import { useEffect } from 'react';

/**
 * Zoom belongs to the bench, not to the page.
 *
 * Pinching, Ctrl+wheel and Ctrl+plus all scale a web page by default, which on
 * a phone leaves the toolbar half off the screen and the workspace no easier to
 * work in. Blocking them here means the only thing that scales is the
 * workspace, through its own zoom.
 */
export function usePageZoomLock() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();

    // Two fingers anywhere is a pinch, and the workspace handles its own.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    // Ctrl+0 is left alone so the page can always be put back to 100%.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_'].includes(e.key)) e.preventDefault();
    };

    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    document.addEventListener('gestureend', stop);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('gestureend', stop);
      document.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
