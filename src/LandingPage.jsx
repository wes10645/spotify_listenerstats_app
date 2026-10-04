import { useEffect, useRef, useState } from "react";
import p5 from "p5";

// How the intro plays:
//   spread  -> molds burst out from the center, fast at first, then slowing to normal speed
//   gather  -> every mold flies to a point inside the letters of "Spotiboard"
//   roam    -> some molds stay on the letters (so the molds ARE the title), the rest burst
//              outward and go back to normal slime behavior. The tagline shows for 2s and
//              fades; the login button fades in.
// Clicking "Log in with Spotify" still makes every mold swirl into the button before logging in.
const SPREAD_MS = 900; // how long the burst lasts before molds start gathering
const GATHER_MAX_MS = 1400; // release molds after this long even if not every one has arrived
const TAGLINE_MS = 2000; // how long the tagline stays before fading out
const TITLE = "Spotiboard";

// Finds the pixels covered by the title's letters. Draws the word on a hidden canvas
// in the same font as the (invisible) <h1>, lined up on the h1's real text baseline,
// then keeps every 2nd pixel that has ink.
// baselineEl is a zero-size marker inside the h1: the browser places it exactly on the baseline.
function letterPoints(titleEl, baselineEl) {
  const rect = titleEl.getBoundingClientRect();
  const baselineY = baselineEl.getBoundingClientRect().bottom;
  const style = window.getComputedStyle(titleEl);
  const pad = Math.ceil(rect.height / 2); // extra room above and below so tall letters aren't clipped
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(rect.width);
  canvas.height = Math.ceil(rect.height) + 2 * pad;
  const ctx = canvas.getContext("2d");
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.letterSpacing = style.letterSpacing;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  const canvasTop = rect.top - pad;
  ctx.fillText(TITLE, canvas.width / 2, baselineY - canvasTop);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const points = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 128) points.push({ x: rect.left + x, y: canvasTop + y });
    }
  }
  return points;
}

export default function LandingPage({ onLogin }) {
  const sketchRef = useRef(null);
  const p5Ref = useRef(null);
  const titleRef = useRef(null);
  const baselineRef = useRef(null);
  const buttonRef = useRef(null);
  const btnXRef = useRef(0);
  const btnYRef = useRef(0);
  const convergingRef = useRef(false);
  const loginCalledRef = useRef(false);
  const [buttonVisible, setButtonVisible] = useState(true);
  const [revealed, setRevealed] = useState(false); // login button shown
  const [taglineVisible, setTaglineVisible] = useState(false);
  const [staticTitle, setStaticTitle] = useState(false); // plain text title when there's no animation

  function handleButtonClick() {
    if (convergingRef.current) return;

    // capture button center BEFORE hiding/unmounting it
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      btnXRef.current = rect.left + rect.width / 2;
      btnYRef.current = rect.top + rect.height / 2;
    }

    convergingRef.current = true;
    setButtonVisible(false); // hide button so molds fill that spot

    // Fallback: always trigger login even if the "arrived" threshold isn't met.
    window.setTimeout(() => {
      if (loginCalledRef.current) return;
      loginCalledRef.current = true;
      onLogin();
    }, 2500);
  }

  useEffect(() => {
    const timers = [];
    const later = (fn, ms) => timers.push(window.setTimeout(fn, ms));

    // Shows the tagline briefly and the login button for good. Runs once.
    let didReveal = false;
    function reveal() {
      if (didReveal) return;
      didReveal = true;
      setRevealed(true);
      setTaglineVisible(true);
      later(() => setTaglineVisible(false), TAGLINE_MS);
    }

    // People who turn off animations in their OS settings get a plain title right away
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setStaticTitle(true);
      reveal();
    }
    // Safety net: if the animation can't run, show a plain title and the button anyway
    later(() => {
      if (!didReveal) {
        setStaticTitle(true);
        reveal();
      }
    }, 4000);

    // The canvas needs the Baloo 2 font loaded before it can draw letters in it
    let fontReady = !document.fonts;
    document.fonts?.load(`800 64px "Baloo 2"`).finally(() => (fontReady = true));

    const sketch = (p) => {
      let molds = [];
      const num = 8000;
      let d;
      let phase = reduceMotion ? "roam" : "spread";
      let phaseStart = 0;
      let titleCenter = null;

      class Mold {
        constructor(x, y, speed = 1) {
          this.x = x ?? p.random(p.width / 2 - 20, p.width / 2 + 20);
          this.y = y ?? p.random(p.height / 2 - 20, p.height / 2 + 20);
          this.r = 1.2;
          this.heading = p.random(360);
          this.vx = p.cos(this.heading);
          this.vy = p.sin(this.heading);
          this.rotAngle = 15;
          this.rSensorPos = p.createVector(0, 0);
          this.lSensorPos = p.createVector(0, 0);
          this.fSensorPos = p.createVector(0, 0);
          this.sensorAngle = 25;
          this.sensorDist = 20;
          this.speed = speed;
          this.target = null; // a point inside a letter
          this.pinned = false; // true = this mold stays on the letters after the intro
        }

        update() {
          if (convergingRef.current) {
            const dx = btnXRef.current - this.x;
            const dy = btnYRef.current - this.y;
            const dist = p.sqrt(dx * dx + dy * dy);

            // accelerate toward button
            this.speed = p.min(this.speed * 1.05, 20); // ramp up speed
            const angleToBtn = p.degrees(p.atan2(dy, dx));

            // spiral effect: offset heading slightly so they swirl in
            const spiral = p.map(dist, 0, p.width, 0, 90);
            this.heading = angleToBtn + spiral;

            this.vx = p.cos(this.heading);
            this.vy = p.sin(this.heading);
            this.x += this.vx * this.speed;
            this.y += this.vy * this.speed;

            // once close enough to button, mark as done
            if (dist < 5) {
              this.x = btnXRef.current;
              this.y = btnYRef.current;
            }
          } else if (phase === "gather") {
            // ease 10% of the remaining distance each frame, with a little wobble so it looks alive
            this.x += (this.target.x - this.x) * 0.1 + p.random(-0.6, 0.6);
            this.y += (this.target.y - this.y) * 0.1 + p.random(-0.6, 0.6);
          } else if (this.pinned) {
            // letters: spring back to its spot, but the mouse can scatter them a little
            const dx = this.x - p.mouseX;
            const dy = this.y - p.mouseY;
            const distToMouse = p.sqrt(dx * dx + dy * dy);
            if (distToMouse < 50 && distToMouse > 0.0001) {
              this.x += (dx / distToMouse) * 4;
              this.y += (dy / distToMouse) * 4;
            }
            this.x += (this.target.x - this.x) * 0.15 + p.random(-0.4, 0.4);
            this.y += (this.target.y - this.y) * 0.15 + p.random(-0.4, 0.4);
          } else {
            // normal behavior; speed starts high during the burst and settles back to 1
            this.speed = p.max(1, this.speed * 0.985);
            this.vx = p.cos(this.heading);
            this.vy = p.sin(this.heading);
            this.x = (this.x + this.vx * this.speed + p.width) % p.width;
            this.y = (this.y + this.vy * this.speed + p.height) % p.height;

            this.getSensorPos(this.rSensorPos, this.heading + this.sensorAngle);
            this.getSensorPos(this.lSensorPos, this.heading - this.sensorAngle);
            this.getSensorPos(this.fSensorPos, this.heading);

            let index, l, r, f;
            index =
              4 * (d * p.floor(this.rSensorPos.y)) * (d * p.width) +
              4 * (d * p.floor(this.rSensorPos.x));
            r = p.pixels[index];
            index =
              4 * (d * p.floor(this.lSensorPos.y)) * (d * p.width) +
              4 * (d * p.floor(this.lSensorPos.x));
            l = p.pixels[index];
            index =
              4 * (d * p.floor(this.fSensorPos.y)) * (d * p.width) +
              4 * (d * p.floor(this.fSensorPos.x));
            f = p.pixels[index];

            const dx = p.mouseX - this.x;
            const dy = p.mouseY - this.y;
            const distToMouse = p.sqrt(dx * dx + dy * dy);
            if (distToMouse < 300) {
              const angleToMouse = p.degrees(p.atan2(dy, dx));
              const diff = ((angleToMouse - this.heading + 540) % 360) - 180;
              const strength = p.map(distToMouse, 0, 300, 0.3, 0.02);
              this.heading += diff * strength;
              if (distToMouse > 0.0001) {
                this.x += (dx / distToMouse) * 1.5;
                this.y += (dy / distToMouse) * 1.5;
              }
            }

            if (f > l && f > r) {
              this.heading += 0;
            } else if (f < l && f < r) {
              p.random(1) < 0.5
                ? (this.heading += this.rotAngle)
                : (this.heading -= this.rotAngle);
            } else if (l > r) {
              this.heading -= this.rotAngle;
            } else if (r > l) {
              this.heading += this.rotAngle;
            }
          }
        }

        display() {
          p.noStroke();
          if (convergingRef.current) {
            // flash brighter green as they converge
            const dx = btnXRef.current - this.x;
            const dy = btnYRef.current - this.y;
            const dist = p.sqrt(dx * dx + dy * dy);
            const brightness = p.map(dist, 0, 300, 255, 150);
            p.fill(29, brightness, 84);
          } else if (this.pinned && phase === "roam") {
            p.fill(30, 215, 96); // letters a bit brighter than the slime around them
          } else {
            p.fill(29, 185, 84);
          }
          p.ellipse(this.x, this.y, this.r * 2, this.r * 2);
        }

        getSensorPos(sensor, angle) {
          sensor.x =
            (this.x + this.sensorDist * p.cos(angle) + p.width) % p.width;
          sensor.y =
            (this.y + this.sensorDist * p.sin(angle) + p.height) % p.height;
        }
      }

      // Gives each mold a spot in the letters. The first molds (up to ~3 per spot) stay as the title.
      function assignLetterTargets() {
        const points = titleRef.current ? letterPoints(titleRef.current, baselineRef.current) : [];
        if (points.length === 0) return false;
        const rect = titleRef.current.getBoundingClientRect();
        titleCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const pinnedCount = Math.min(molds.length * 0.6, points.length * 3);
        molds.forEach((m, i) => {
          m.target = points[i % points.length];
          m.pinned = i < pinnedCount;
        });
        return true;
      }

      function startGather() {
        if (!assignLetterTargets()) {
          setStaticTitle(true);
          return startRoam();
        }
        phase = "gather";
        phaseStart = p.millis();
      }

      function startRoam() {
        // the molds that aren't part of the title burst outward from it
        if (titleCenter) {
          for (const m of molds) {
            if (m.pinned) continue;
            m.heading = p.degrees(p.atan2(m.y - titleCenter.y, m.x - titleCenter.x)) + p.random(-20, 20);
            m.speed = p.random(2, 4);
          }
        }
        phase = "roam";
        reveal();
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.angleMode(p.DEGREES);
        d = p.pixelDensity();
        // during the burst, each mold starts 8-16x faster than normal, so they cover
        // roughly 300-600px of screen before gathering starts
        for (let i = 0; i < num; i++) molds[i] = new Mold(undefined, undefined, phase === "spread" ? p.random(8, 16) : 1);
        phaseStart = p.millis();
      };

      p.draw = () => {
        // more fade while gathering so the letters read clearly; long trails otherwise
        p.background(0, convergingRef.current ? 8 : phase === "gather" ? 24 : 2);
        if (!convergingRef.current && phase !== "gather") p.loadPixels();

        const elapsed = p.millis() - phaseStart;
        // wait for the font (up to 2s) so the letters come out in Baloo 2
        if (phase === "spread" && elapsed > SPREAD_MS && (fontReady || elapsed > 2000)) {
          startGather();
        } else if (phase === "gather") {
          const done = p.frameCount % 10 === 0 &&
            molds.filter((m) => p.abs(m.target.x - m.x) + p.abs(m.target.y - m.y) < 6).length > molds.length * 0.8;
          if (done || elapsed > GATHER_MAX_MS) startRoam();
        }

        for (let i = 0; i < molds.length; i++) {
          molds[i].update();
          molds[i].display();
        }

        // portal flash: draw a glowing ring at button center when converging
        if (convergingRef.current && btnXRef.current && btnYRef.current) {
          const t = p.frameCount;
          for (let ring = 3; ring >= 0; ring--) {
            const radius = p.map(
              p.sin(t * 8 + ring * 20),
              -1,
              1,
              5,
              30 + ring * 15
            );
            const alpha = p.map(ring, 0, 3, 180, 40);
            p.noFill();
            p.stroke(29, 185, 84, alpha);
            p.strokeWeight(2);
            p.ellipse(
              btnXRef.current,
              btnYRef.current,
              radius * 2,
              radius * 2
            );
          }
          p.noStroke();

          // check if most molds have arrived — then trigger login
          if (!loginCalledRef.current && p.frameCount % 10 === 0) {
            const arrived = molds.filter((m) => {
              const dx = btnXRef.current - m.x;
              const dy = btnYRef.current - m.y;
              return p.sqrt(dx * dx + dy * dy) < 30;
            }).length;

            if (arrived > molds.length * 0.85) {
              loginCalledRef.current = true;
              setTimeout(onLogin, 300); // small pause then login
            }
          }
        }
      };

      p.mouseMoved = () => {
        if (convergingRef.current || phase !== "roam") return;
        for (let i = 0; i < 30; i++) {
          molds.push(
            new Mold(p.mouseX + p.random(-20, 20), p.mouseY + p.random(-20, 20))
          );
        }
        // trim the oldest free-roaming molds, never the ones forming the letters
        if (molds.length > num + 2000) molds.splice(molds.findIndex((m) => !m.pinned), 30);
      };

      p.mouseClicked = () => {
        if (convergingRef.current || phase !== "roam") return;
        for (let i = 0; i < 200; i++) {
          const m = new Mold(
            p.mouseX + p.random(-5, 5),
            p.mouseY + p.random(-5, 5)
          );
          m.heading = p.random(360);
          molds.push(m);
        }
        if (molds.length > num + 2000) molds.splice(molds.findIndex((m) => !m.pinned), 200);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        // the title moved, so move the letter molds with it
        if (phase === "roam" && molds.some((m) => m.pinned)) {
          const points = letterPoints(titleRef.current, baselineRef.current);
          let i = 0;
          for (const m of molds) if (m.pinned) m.target = points[i++ % points.length];
        }
      };
    };

    const p5Instance = new p5(sketch, sketchRef.current);
    p5Ref.current = p5Instance;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      p5Instance.remove();
    };
  }, [onLogin]);

  return (
    <div className="landing">
      <div ref={sketchRef} className="landing-canvas" />
      <div className="landing-content">
        {/* Invisible while the molds draw the letters; screen readers still read it */}
        <h1 ref={titleRef} className={staticTitle ? "brand landing-title static" : "brand landing-title"}>
          {TITLE}
          <span ref={baselineRef} className="baseline-probe" aria-hidden="true" />
        </h1>
        <p className={taglineVisible ? "tagline visible" : "tagline"}>Your Spotify listening, visualized.</p>
        {buttonVisible && (
          <button
            ref={buttonRef}
            className={revealed ? "login-button visible" : "login-button"}
            onClick={handleButtonClick}
          >
            Log in with Spotify
          </button>
        )}
      </div>
    </div>
  );
}
