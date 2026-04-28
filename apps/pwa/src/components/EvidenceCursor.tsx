import { useEffect, useRef } from "react";

export function EvidenceCursor() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    const move = (event: PointerEvent) => {
      node.style.setProperty("--cursor-x", `${event.clientX}px`);
      node.style.setProperty("--cursor-y", `${event.clientY}px`);
    };
    const enter = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-danger-target]")) {
        node.dataset.mode = "danger";
      } else if (target.closest("[data-evidence-target]")) {
        node.dataset.mode = "ice-crystal";
      } else if (target.closest("button, a, input, select, [role='button']")) {
        node.dataset.mode = "soft-ink";
      } else {
        node.dataset.mode = "ink";
      }
    };
    window.addEventListener("pointermove", move);
    document.addEventListener("mouseover", enter);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("mouseover", enter);
    };
  }, []);

  return (
    <div ref={ref} className="evidence-cursor" aria-hidden="true" data-mode="ink" title="墨迹、冰晶与证据光锥">
      <span className="cursor-ice" />
      <span className="cursor-ink-trail trail-a" />
      <span className="cursor-ink-trail trail-b" />
    </div>
  );
}
