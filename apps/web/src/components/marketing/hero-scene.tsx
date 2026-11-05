'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { SculptureFallback } from './sculpture-fallback.tsx';

export default function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      container.dataset.webgl = 'fallback';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    let context: WebGL2RenderingContext | null = null;
    try {
      context = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // A blocked graphics context gets the same composed artwork as no WebGL.
    }

    if (!context) {
      container.dataset.webgl = 'fallback';
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    } catch {
      container.dataset.webgl = 'fallback';
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    const sculpture = new THREE.Group();
    scene.add(sculpture);

    const coreGeometry = new THREE.TorusKnotGeometry(1.03, 0.32, 160, 24, 2, 3);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: '#b8ed78',
      emissive: '#3e5d25',
      emissiveIntensity: 0.62,
      metalness: 0.72,
      roughness: 0.24,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.set(0.42, -0.25, 0.18);
    sculpture.add(core);

    const cageGeometry = new THREE.IcosahedronGeometry(1.78, 1);
    const cageMaterial = new THREE.MeshBasicMaterial({
      color: '#ad99ff',
      wireframe: true,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });
    const cage = new THREE.Mesh(cageGeometry, cageMaterial);
    sculpture.add(cage);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#d5ffa1',
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
    });
    const ringGeometry = new THREE.TorusGeometry(2.03, 0.008, 6, 160);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.set(1.08, 0.24, -0.45);
    sculpture.add(ring);

    const secondRing = new THREE.Mesh(ringGeometry, ringMaterial);
    secondRing.rotation.set(0.28, 1.16, 0.72);
    secondRing.scale.setScalar(0.83);
    sculpture.add(secondRing);

    const particlePositions = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index += 1) {
      const angle = index * 2.39996;
      const radius = 2.2 + ((index * 37) % 100) / 65;
      particlePositions[index * 3] = Math.cos(angle) * radius;
      particlePositions[index * 3 + 1] = Math.sin(angle * 1.7) * radius * 0.7;
      particlePositions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: '#d8ffab',
      size: 0.018,
      transparent: true,
      opacity: 0.52,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    sculpture.add(particles);

    scene.add(new THREE.AmbientLight('#b9a8ff', 1.25));
    const keyLight = new THREE.DirectionalLight('#efffdf', 4.2);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight('#9b7cff', 38, 12, 2);
    rimLight.position.set(-3, -1, 3);
    scene.add(rimLight);
    const limeLight = new THREE.PointLight('#baff75', 24, 10, 2);
    limeLight.position.set(3, -3, 1);
    scene.add(limeLight);

    const pointer = { x: 0, y: 0 };
    let frame = 0;
    let running = false;
    let inView = true;
    let disposed = false;

    const render = (time: number) => {
      const seconds = time * 0.001;
      sculpture.rotation.y = seconds * 0.105 + pointer.x * 0.18;
      sculpture.rotation.x = Math.sin(seconds * 0.24) * 0.08 + pointer.y * 0.12;
      sculpture.rotation.z = Math.sin(seconds * 0.16) * 0.055;
      cage.rotation.y = -seconds * 0.07;
      cage.rotation.x = seconds * 0.035;
      ring.rotation.z = -0.45 + seconds * 0.055;
      secondRing.rotation.x = 0.28 - seconds * 0.04;
      particles.rotation.y = seconds * 0.025;
      renderer.render(scene, camera);
    };

    const tick = (time: number) => {
      if (!running || disposed) return;
      render(time);
      frame = window.requestAnimationFrame(tick);
    };

    const updatePlayback = () => {
      const shouldRun = inView && !document.hidden && !disposed && !reducedMotion.matches;
      if (shouldRun && !running) {
        running = true;
        frame = window.requestAnimationFrame(tick);
      } else if (!shouldRun && running) {
        running = false;
        window.cancelAnimationFrame(frame);
      }
    };

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const desktop = width >= 768;
      sculpture.position.set(desktop ? 1.3 : 0, desktop ? 0 : 0.8, 0);
      sculpture.scale.setScalar(desktop ? 1 : 0.82);
      renderer.render(scene, camera);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * -2;
    };
    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    const onVisibilityChange = () => updatePlayback();
    const onReducedMotionChange = () => {
      container.dataset.webgl = reducedMotion.matches ? 'fallback' : 'ready';
      updatePlayback();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      container.dataset.webgl = 'fallback';
      running = false;
      window.cancelAnimationFrame(frame);
    };

    const interactionTarget = container.closest('.hero') ?? container;
    interactionTarget.addEventListener('pointermove', onPointerMove as EventListener, {
      passive: true,
    });
    interactionTarget.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', onReducedMotionChange);
    canvas.addEventListener('webglcontextlost', onContextLost);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? true;
        updatePlayback();
      },
      { rootMargin: '100px' },
    );
    intersectionObserver.observe(container);

    resize();
    render(0);
    container.dataset.webgl = 'ready';
    updatePlayback();

    return () => {
      disposed = true;
      running = false;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      interactionTarget.removeEventListener('pointermove', onPointerMove as EventListener);
      interactionTarget.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener('change', onReducedMotionChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={containerRef} className="hero-scene" data-webgl="loading">
      <SculptureFallback />
    </div>
  );
}
