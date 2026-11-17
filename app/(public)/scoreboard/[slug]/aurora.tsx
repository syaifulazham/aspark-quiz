"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

// Soft, slowly drifting colour fields — the "aurora".
const BLOBS = [
  { color: "rgba(45, 212, 191, 0.55)", size: 70, x: -10, y: -20 }, // teal
  { color: "rgba(139, 92, 246, 0.55)", size: 65, x: 45, y: -25 },  // violet
  { color: "rgba(236, 72, 153, 0.40)", size: 55, x: 70, y: 30 },   // magenta
  { color: "rgba(59, 130, 246, 0.45)", size: 60, x: 5, y: 45 },    // blue
  { color: "rgba(249, 115, 22, 0.28)", size: 45, x: 40, y: 60 },   // spark orange
];

export function Aurora() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const blobs = Array.from(el.querySelectorAll<HTMLElement>("[data-blob]"));
    const anims = blobs.map((b, i) =>
      animate(b, {
        translateX: [`${-8 + i * 3}vw`, `${10 - i * 4}vw`],
        translateY: [`${-6 + i * 2}vh`, `${8 - i * 3}vh`],
        scale: [1, 1.25 - i * 0.04],
        rotate: [0, i % 2 ? 40 : -40],
        duration: 14000 + i * 3500,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        delay: i * 600,
      })
    );
    const ribbons = animate(el.querySelectorAll("[data-ribbon]"), {
      translateX: ["-12%", "12%"],
      skewX: [-8, 8],
      opacity: [0.35, 0.7],
      duration: 18000,
      ease: "inOutQuad",
      loop: true,
      alternate: true,
    });
    return () => {
      anims.forEach((a) => a.revert());
      ribbons.revert();
    };
  }, []);

  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#03050c]">
      {BLOBS.map((b, i) => (
        <div
          key={i}
          data-blob
          className="absolute rounded-full mix-blend-screen"
          style={{
            width: `${b.size}vmax`,
            height: `${b.size}vmax`,
            left: `${b.x}%`,
            top: `${b.y}%`,
            background: `radial-gradient(circle at center, ${b.color} 0%, transparent 65%)`,
            filter: "blur(60px)",
          }}
        />
      ))}
      {/* Aurora curtains */}
      <div
        data-ribbon
        className="absolute -left-1/4 top-[8%] h-[38vh] w-[150%] opacity-50 mix-blend-screen"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.35) 20%, rgba(56,189,248,0.25) 45%, rgba(167,139,250,0.35) 70%, transparent 100%)",
          filter: "blur(48px)",
          transform: "rotate(-6deg)",
        }}
      />
      <div
        data-ribbon
        className="absolute -left-1/4 top-[30%] h-[22vh] w-[150%] opacity-40 mix-blend-screen"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.3) 30%, rgba(236,72,153,0.22) 60%, transparent 100%)",
          filter: "blur(56px)",
          transform: "rotate(4deg)",
        }}
      />
      {/* Stars */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 12% 18%, #fff8 50%, transparent 51%), radial-gradient(1px 1px at 72% 12%, #fff6 50%, transparent 51%), radial-gradient(1.5px 1.5px at 38% 72%, #fff5 50%, transparent 51%), radial-gradient(1px 1px at 86% 64%, #fff7 50%, transparent 51%), radial-gradient(1px 1px at 22% 88%, #fff4 50%, transparent 51%), radial-gradient(1px 1px at 58% 42%, #fff5 50%, transparent 51%)",
          backgroundSize: "480px 480px",
        }}
      />
      {/* Vignette keeps text readable */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(3,5,12,0.55)_70%,rgba(3,5,12,0.9)_100%)]" />
    </div>
  );
}
