// All the game's motion in one place.
// GSAP drives gameplay (tokens, dice, the "Your turn" banner, cards);
// anime.js does the small UI touches (board intro, money floaters, buildings, turn badge, confetti).
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { animate, createTimeline, random } from "animejs";

gsap.registerPlugin(useGSAP);
export { gsap, useGSAP };

export const DICE_MS = 800;
const STEP = 0.2;
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- GSAP ----------

// Hop square by square: the blob stretches as it jumps, squashes on each landing,
// and its pupils look the way it's heading.
export function hopAlong(el, points, { delay = 0, onComplete }) {
  const pupils = el.querySelector(".pupils");
  const tl = gsap.timeline({ delay, onComplete });
  let prev = { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  for (const point of points) {
    const dx = Math.sign(parseFloat(point.left) - prev.left);
    const dy = Math.sign(parseFloat(point.top) - prev.top);
    prev = { left: parseFloat(point.left), top: parseFloat(point.top) };
    tl.to(pupils, { x: dx * 1.6, y: dy * 1.6, duration: 0.08 })
      .to(el, { left: point.left, top: point.top, duration: STEP, ease: "power1.inOut" }, "<")
      .to(el, { y: -18, scaleX: 0.88, scaleY: 1.14, duration: STEP / 2, ease: "power2.out", yoyo: true, repeat: 1 }, "<");
  }
  tl.to(el, { scaleX: 1.35, scaleY: 0.7, duration: 0.09, yoyo: true, repeat: 1, ease: "power1.out" })
    .to(pupils, { x: 0, y: 0, duration: 0.3 });
  return tl;
}

// Blink every few seconds, forever. Returns the timeline so the component can kill it.
export function blinkLoop(el) {
  const eyes = el.querySelector(".eyes");
  return gsap
    .timeline({ repeat: -1, repeatDelay: gsap.utils.random(2, 5), delay: gsap.utils.random(0, 3) })
    .to(eyes, { scaleY: 0.1, transformOrigin: "50% 60%", duration: 0.07, yoyo: true, repeat: 1, ease: "power1.in" });
}

// Long moves (jail, card teleports): shrink away, reappear at the destination.
export function jumpTo(el, point, { delay = 0, onComplete }) {
  return gsap
    .timeline({ delay, onComplete })
    .to(el, { scale: 0, rotation: 180, duration: 0.25, ease: "back.in(2)" })
    .set(el, point)
    .to(el, { scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2.5)" });
}

// Throw a die up with a spin, then let it bounce down. Lasts DICE_MS.
export function throwDie(el, i) {
  return gsap
    .timeline()
    .to(el, { y: -46, x: i ? 10 : -10, rotation: `+=${300 + i * 120}`, duration: 0.35, ease: "power2.out" })
    .to(el, { y: 0, x: 0, rotation: `+=${60 + i * 60}`, duration: 0.45, ease: "bounce.out" });
}

export function bannerIn(el) {
  return gsap
    .timeline()
    .fromTo(el, { scale: 0.3, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: "back.out(2.2)" })
    .to(el, { scale: 1.05, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut" })
    .to(el, { opacity: 0, y: -30, scale: 0.9, duration: 0.35, ease: "power2.in" }, "+=0.5");
}

export function flipIn(el) {
  return gsap.fromTo(el, { rotationY: 90, scale: 0.8, opacity: 0, transformPerspective: 600 }, { rotationY: 0, scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.6)" });
}

// ---------- anime.js ----------

// Tiles appear around the ring in board order.
export function boardIntro(tiles) {
  return animate(tiles, {
    opacity: [0, 1],
    scale: [0.4, 1],
    delay: (el) => Number(el.dataset.i) * 20,
    duration: 550,
    ease: "outBack(1.7)",
  });
}

export function floatDelta(el) {
  return animate(el, {
    translateY: [-4, -30],
    opacity: [
      { from: 0, to: 1, duration: 150 },
      { to: 0, duration: 500, delay: 900 },
    ],
    duration: 1550,
    ease: "outExpo",
  });
}

export function popIn(el) {
  return animate(el, { scale: [0, 1], duration: 700, ease: "outElastic(1, .5)" });
}

export function badgeIn(el) {
  return createTimeline()
    .add(el, { scale: [0.6, 1], opacity: [0, 1], duration: 600, ease: "outElastic(1, .6)" })
    .add(el.querySelector(".blob"), { rotate: [-25, 0], scale: [0.4, 1], duration: 700, ease: "outElastic(1, .45)" }, 0);
}

// Winner confetti: bursts up from the middle, then drifts down.
export function confettiBurst(container) {
  const colors = ["#ffd166", "#ff5a5f", "#3ec1d3", "#8e6cef", "#4cd964", "#ff8c42"];
  const pieces = Array.from({ length: 90 }, (_, i) => {
    const el = document.createElement("i");
    el.style.background = colors[i % colors.length];
    container.append(el);
    return el;
  });
  return animate(pieces, {
    translateX: { from: 0, to: () => random(-window.innerWidth / 2, window.innerWidth / 2) },
    translateY: [
      { from: 0, to: () => random(-window.innerHeight * 0.55, -window.innerHeight * 0.2), duration: 700, ease: "outCubic" },
      { to: window.innerHeight * 0.7, duration: () => random(1600, 2600), ease: "inQuad" },
    ],
    rotate: () => random(-720, 720),
    scale: { from: 0, to: () => random(6, 12) / 10 },
    delay: () => random(0, 250),
    ease: "outCubic",
  });
}
