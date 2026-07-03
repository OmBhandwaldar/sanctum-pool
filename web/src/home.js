// Landing / homepage for Sanctum Pool.
// Matches the existing mint-glass theme (tokens, textures, Manrope + JetBrains
// Mono). Statement typography, heavy whitespace, textured section bands, a
// thematic canvas "commitment lattice", Lenis smooth scroll, and GSAP
// scroll-reveals. All motion respects prefers-reduced-motion.
import Lenis from "lenis";
import { gsap } from "gsap";
import { CONFIG } from "./config.js";
import { getCommitments } from "./lib/soroban.js";

const A = {
  arrow: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  down: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m6 13 6 6 6-6"/></svg>',
  lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  route: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
  fork: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5.5V11c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5.5z"/><path d="m9 12 2 2 4-4"/></svg>',
  gh: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 8.84 21.5c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
};
const CTA_TAIL = `<span class="hx-chip">${A.arrow}</span>`;
const REPO = "https://github.com/OmBhandwaldar/sanctum-pool";
const explorer = (id) => `https://stellar.expert/explorer/testnet/contract/${id}`;

export function viewHome() {
  return `
<div class="home">
  <canvas class="hx-lattice" id="hx-lattice" aria-hidden="true"></canvas>

  <!-- HERO -->
  <section class="hx-hero">
    <span class="hx-eyebrow" data-reveal>Compliant ZK privacy · Stellar Protocol 25/26</span>
    <h1 class="hx-h1" data-reveal>
      Privacy with<br><span class="hx-em">provable innocence.</span>
    </h1>
    <p class="hx-sub" data-reveal>
      A shielded pool on Stellar where honest money moves privately — and stays auditable.
    </p>
    <div class="hx-actions" data-reveal>
      <button class="hx-btn hx-btn-pri js-launch">Launch app ${CTA_TAIL}</button>
      <a class="hx-btn hx-btn-ghost" href="#how" data-scroll>See how it works ${A.down}</a>
    </div>
    <div class="hx-microrow" data-reveal>
      <span>On-chain BN254 verification</span><i></i>
      <span>Proofs generated in-browser</span><i></i>
      <span>Live on testnet</span>
    </div>
  </section>

  <!-- THE GAP -->
  <section class="hx-sec" id="gap">
    <span class="hx-tag" data-reveal>The gap</span>
    <h2 class="hx-h2" data-reveal>
      Transparent chains expose everyone.<br>
      Mixers hide everyone — <span class="hx-dim">including criminals.</span>
    </h2>
    <div class="hx-tri">
      <div class="hx-tri-card" data-reveal>
        <div class="hx-tri-k">Public chains</div>
        <p>Every payment is visible forever. No financial privacy for salaries, suppliers, or treasuries.</p>
      </div>
      <div class="hx-tri-card" data-reveal>
        <div class="hx-tri-k">Plain mixers</div>
        <p>Real privacy, but tainted funds are indistinguishable from honest ones — so they get sanctioned.</p>
      </div>
      <div class="hx-tri-card hx-tri-hi" data-reveal>
        <div class="hx-tri-k">Sanctum Pool</div>
        <p>Private <em>and</em> compliant: only screened deposits withdraw, and any single payment is provable to an auditor.</p>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="hx-sec" id="how">
    <span class="hx-tag" data-reveal>How it works</span>
    <h2 class="hx-h2" data-reveal>Four moves. Zero links.</h2>
    <div class="hx-steps">
      ${[
        [A.lock, "01", "Deposit", "A fixed denomination joins the pool. On-chain: only a commitment — never the amount or destination."],
        [A.check, "02", "Approve", "The ASP screens the deposit and adds its label to the compliance-approved set."],
        [A.route, "03", "Withdraw", "A browser-side ZK proof releases funds to a fresh address with no link to the deposit."],
        [A.eye, "04", "Audit", "Hand an auditor one disclosure key; they verify that single payment and learn nothing else."],
      ].map(([ic, n, t, d]) => `
        <div class="hx-step" data-reveal>
          <div class="hx-step-top"><span class="hx-step-ic">${ic}</span><span class="hx-step-n">${n}</span></div>
          <h3>${t}</h3><p>${d}</p>
        </div>`).join("")}
    </div>
  </section>

  <!-- WHAT THE ZK PROVES (textured band) -->
  <section class="hx-band" id="proof-band">
    <div class="hx-band-inner">
      <span class="hx-tag" data-reveal>Load-bearing ZK</span>
      <h2 class="hx-h2" data-reveal>One proof.<br>Four guarantees.</h2>
      <p class="hx-lead" data-reveal>A withdrawal is impossible without a valid Groth16 proof — verified on-chain by Stellar's native BN254 <code>pairing_check</code>. In one proof, revealing nothing about which deposit is yours:</p>
      <div class="hx-proofs">
        ${[
          [A.fork, "State membership", "Your commitment is a leaf in the pool's Merkle tree."],
          [A.shield, "Compliance membership", "Your label is in the ASP-approved association set."],
          [A.lock, "No double-spend", "A one-time nullifier is revealed and tracked on-chain."],
          [A.route, "Recipient binding", "The payout address is fixed inside the proof — no front-running."],
        ].map(([ic, t, d]) => `
          <div class="hx-proof" data-reveal>
            <span class="hx-proof-ic">${ic}</span>
            <div><h3>${t}</h3><p>${d}</p></div>
          </div>`).join("")}
      </div>
      <pre class="hx-code" data-reveal><code><span class="c">// the note scheme</span>
precommitment = <span class="f">Poseidon</span>(nullifier, secret)
label         = <span class="f">Poseidon</span>(scope, nonce)
commitment    = <span class="f">Poseidon</span>(amount, label, precommitment)  <span class="c">// leaf</span>
nullifierHash = <span class="f">Poseidon</span>(nullifier)                     <span class="c">// public</span></code></pre>
    </div>
  </section>

  <!-- LIVE -->
  <section class="hx-sec" id="live">
    <span class="hx-tag" data-reveal>Live on testnet</span>
    <h2 class="hx-h2" data-reveal>Verified on-chain. Right now.</h2>
    <div class="hx-live">
      <div class="hx-live-stat" data-reveal>
        <div class="hx-live-n" id="hx-count" data-target="0">—</div>
        <div class="hx-live-l">total deposits in the pool</div>
      </div>
      <div class="hx-contracts" data-reveal>
        <a class="hx-contract" href="${explorer(CONFIG.verifier)}" target="_blank" rel="noopener">
          <div class="hx-contract-k">Verifier · Groth16 / BN254</div>
          <div class="hx-contract-v">${CONFIG.verifier.slice(0, 10)}…${CONFIG.verifier.slice(-6)}</div>
        </a>
        <a class="hx-contract" href="${explorer(CONFIG.pool)}" target="_blank" rel="noopener">
          <div class="hx-contract-k">Pool · deposits / withdrawals</div>
          <div class="hx-contract-v">${CONFIG.pool.slice(0, 10)}…${CONFIG.pool.slice(-6)}</div>
        </a>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="hx-cta">
    <h2 class="hx-cta-h" data-reveal>Move money privately.<br>Prove it was clean.</h2>
    <button class="hx-btn hx-btn-pri hx-btn-lg js-launch" data-reveal>Launch app ${CTA_TAIL}</button>
  </section>

  <footer class="hx-foot">
    <div class="hx-foot-l"><span class="hx-foot-mark"></span> Sanctum Pool — compliant ZK privacy on Stellar</div>
    <div class="hx-foot-r">
      <a href="${REPO}" target="_blank" rel="noopener">${A.gh} GitHub</a>
      <a href="${REPO}#readme" target="_blank" rel="noopener">Docs</a>
      <span class="hx-foot-mit">MIT · testnet · unaudited</span>
    </div>
  </footer>
</div>`;
}

// ---- motion + interactivity; returns a teardown fn ----
export function initHome({ onLaunch } = {}) {
  const root = document.querySelector(".home");
  if (!root) return () => {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups = [];

  // launch buttons
  root.querySelectorAll(".js-launch").forEach((b) => (b.onclick = () => onLaunch && onLaunch()));

  // canvas commitment lattice
  const stopLattice = startLattice(document.getElementById("hx-lattice"), reduce);
  if (stopLattice) cleanups.push(stopLattice);

  // live deposit count
  fetchCount().then((n) => animateCount(document.getElementById("hx-count"), n, reduce));

  if (reduce) {
    root.querySelectorAll('[data-scroll]').forEach((a) => (a.onclick = smoothAnchor(null)));
    return () => cleanups.forEach((fn) => fn());
  }

  // Lenis smooth scroll
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  const raf = (t) => lenis.raf(t * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  cleanups.push(() => { gsap.ticker.remove(raf); lenis.destroy(); });
  root.querySelectorAll('[data-scroll]').forEach((a) => (a.onclick = smoothAnchor(lenis)));

  // Reveals: IntersectionObserver triggers a GSAP stagger per section. IO is
  // reliable regardless of the scroll mechanism (Lenis owns wheel/scroll).
  gsap.set(root.querySelectorAll("[data-reveal]"), { y: 26, autoAlpha: 0, filter: "blur(8px)" });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const items = e.target.querySelectorAll("[data-reveal]");
      gsap.to(items, { y: 0, autoAlpha: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out", stagger: 0.08 });
      io.unobserve(e.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  root.querySelectorAll("section, footer").forEach((sec) => {
    if (sec.querySelector("[data-reveal]")) io.observe(sec);
  });
  cleanups.push(() => io.disconnect());

  // subtle hero-lattice parallax, driven off Lenis scroll (no ScrollTrigger)
  const canvas = document.getElementById("hx-lattice");
  const onScroll = ({ scroll }) => { if (canvas) canvas.style.transform = `translate3d(0, ${scroll * 0.12}px, 0)`; };
  lenis.on("scroll", onScroll);
  cleanups.push(() => lenis.off("scroll", onScroll));

  return () => cleanups.forEach((fn) => fn());
}

function smoothAnchor(lenis) {
  return (e) => {
    const id = e.currentTarget.getAttribute("href");
    if (!id || !id.startsWith("#")) return;
    e.preventDefault();
    const el = document.querySelector(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -40, duration: 1.1 });
    else el.scrollIntoView({ behavior: "smooth" });
  };
}

async function fetchCount() {
  try { return (await getCommitments(CONFIG.pool)).length; } catch { return 0; }
}
function animateCount(el, target, reduce) {
  if (!el) return;
  if (reduce || target === 0) { el.textContent = String(target); return; }
  const dur = 900, t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * target));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Thematic background: drifting "commitment" nodes wired into a light lattice.
function startLattice(canvas, reduce) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let w, h, dpr, nodes, raf;
  const N = 46, LINK = 150;
  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const seed = () => {
    nodes = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.6 + 0.8,
    }));
  };
  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    }
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(34,224,166,${(1 - d / LINK) * 0.14})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = "rgba(34,224,166,0.55)";
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  resize(); seed();
  const onResize = () => { resize(); seed(); };
  addEventListener("resize", onResize);
  if (reduce) { frame(); cancelAnimationFrame(raf); } // draw one static frame
  else frame();
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); };
}
