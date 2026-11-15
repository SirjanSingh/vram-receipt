// The leather jacket: a slow turntable of a real 3D model, loaded only when its section comes near
// the viewport, so three.js never touches the first paint. Drag to turn it. Static under
// prefers-reduced-motion, paused offscreen, and the whole figure hides if the model can't load.
const MODEL_URL = "/models/leather-jacket.glb";

export function mountJacket(fig: HTMLElement) {
  const canvas = fig.querySelector("canvas")!;
  let started = false;
  const io = new IntersectionObserver(
    (es) => {
      if (started || !es.some((e) => e.isIntersecting)) return;
      started = true;
      io.disconnect();
      void start(fig, canvas).catch(() => {
        fig.parentElement?.classList.add("no-jacket");
        fig.remove();
      });
    },
    { rootMargin: "400px 0px" },
  );
  io.observe(fig);
}

async function start(fig: HTMLElement, canvas: HTMLCanvasElement) {
  const [THREE, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
  ]);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  // Image-based light so the leather gets real highlights, plus a warm key and a cool rim.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1dc, 1.6);
  key.position.set(2.5, 3, 4);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  rim.position.set(-3, 1.5, -3);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;
  // Centre it and scale it to a unit height, whatever units the file uses.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  scene.add(pivot);
  camera.position.set(0, 0.02, 1.8);
  camera.lookAt(0, 0, 0);

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    // Back off on narrow frames so the sleeves never clip.
    camera.position.z = Math.max(1.8, 2.15 / camera.aspect);
    camera.updateProjectionMatrix();
    draw();
  }

  // Turntable plus drag. Drag adds spin that eases back to the idle speed.
  let angle = -0.5;
  let spin = reduced ? 0 : 0.0045;
  const idle = spin;
  let dragging = false, lastX = 0, onscreen = true, raf = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); kick();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    angle += dx * 0.01;
    spin = dx * 0.0015;
    kick();
  });
  const end = () => { dragging = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  function draw() {
    pivot.rotation.y = angle;
    renderer.render(scene, camera);
  }
  function frame() {
    raf = 0;
    if (!dragging) {
      angle += spin;
      spin += (idle - spin) * 0.04;
    }
    draw();
    if (onscreen && document.visibilityState === "visible" && (idle || dragging || Math.abs(spin - idle) > 1e-4)) kick();
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  new IntersectionObserver((es) => {
    onscreen = es.some((e) => e.isIntersecting);
    if (onscreen) kick();
  }).observe(fig);
  document.addEventListener("visibilitychange", kick);
  new ResizeObserver(resize).observe(canvas);
  resize();
  fig.classList.add("ready");
  kick();
}
