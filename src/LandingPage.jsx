import { useEffect, useRef, useState } from "react";
import p5 from "p5";

export default function LandingPage({ onLogin }) {
  const sketchRef = useRef(null);
  const p5Ref = useRef(null);
  const buttonRef = useRef(null);
  const btnXRef = useRef(0);
  const btnYRef = useRef(0);
  const convergingRef = useRef(false);
  const loginCalledRef = useRef(false);
  const [buttonVisible, setButtonVisible] = useState(true);
  const [titleVisible, setTitleVisible] = useState(false);

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
    const t = window.setTimeout(() => setTitleVisible(true), 150);
    const sketch = (p) => {
      let molds = [];
      const num = 8000;
      let d;

      class Mold {
        constructor(x, y) {
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
          this.speed = 1;
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
          } else {
            // normal behavior
            this.vx = p.cos(this.heading);
            this.vy = p.sin(this.heading);
            this.x = (this.x + this.vx + p.width) % p.width;
            this.y = (this.y + this.vy + p.height) % p.height;

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

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.angleMode(p.DEGREES);
        d = p.pixelDensity();
        for (let i = 0; i < num; i++) molds[i] = new Mold();
      };

      p.draw = () => {
        p.background(0, convergingRef.current ? 8 : 2);
        if (!convergingRef.current) p.loadPixels();
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
        if (convergingRef.current) return;
        for (let i = 0; i < 30; i++) {
          molds.push(
            new Mold(p.mouseX + p.random(-20, 20), p.mouseY + p.random(-20, 20))
          );
        }
        if (molds.length > num + 2000) molds.splice(0, 30);
      };

      p.mouseClicked = () => {
        if (convergingRef.current) return;
        for (let i = 0; i < 200; i++) {
          const m = new Mold(
            p.mouseX + p.random(-5, 5),
            p.mouseY + p.random(-5, 5)
          );
          m.heading = p.random(360);
          molds.push(m);
        }
        if (molds.length > num + 2000) molds.splice(0, 200);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    const p5Instance = new p5(sketch, sketchRef.current);
    p5Ref.current = p5Instance;
    return () => {
      window.clearTimeout(t);
      p5Instance.remove();
    };
  }, [onLogin]);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={sketchRef} style={{ position: "absolute", top: 0, left: 0 }} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: "2.5rem",
            marginBottom: "1.5rem",
            textShadow: "0 0 30px #1DB954",
            fontFamily: "sans-serif",
            opacity: titleVisible ? 1 : 0,
            filter: titleVisible ? "drop-shadow(0 0 22px #1DB954)" : "none",
            transition: "opacity 1200ms ease, filter 1200ms ease",
          }}
        >
          Welcome to Wesley&apos;s Spotify Stat Visualizer!
        </h1>
        {buttonVisible && (
          <button
            ref={buttonRef}
            onClick={handleButtonClick}
            style={{
              backgroundColor: "#1DB954",
              color: "black",
              border: "none",
              padding: "14px 36px",
              borderRadius: "999px",
              fontSize: "1rem",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Log in with Spotify
          </button>
        )}
      </div>
    </div>
  );
}

