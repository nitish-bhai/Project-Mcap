import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MocapFrame, MP_POSE } from '../types';
import { SKELETON_CONNECTIONS } from '../constants';

interface ThreeVisualizerProps {
  frames: MocapFrame[];
  isPlaying: boolean;
  currentFrameIndex: number;
}

const ThreeVisualizer: React.FC<ThreeVisualizerProps> = ({ frames, isPlaying, currentFrameIndex }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pointsRef = useRef<THREE.Mesh[]>([]);
  const linesRef = useRef<THREE.Line[]>([]);
  
  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827); // Tailwind gray-900
    scene.fog = new THREE.Fog(0x111827, 2, 10);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 4);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(2, 5, 2);
    scene.add(dirLight);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 10, 0x475569, 0x1e293b);
    scene.add(gridHelper);

    // Skeleton Pool Initialization
    const jointGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8 }); // Sky blue

    // Create 33 joints (MediaPipe max)
    for (let i = 0; i < 33; i++) {
      const mesh = new THREE.Mesh(jointGeo, jointMat);
      mesh.visible = false;
      scene.add(mesh);
      pointsRef.current.push(mesh);
    }

    // Create connections
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0, linewidth: 2 });
    SKELETON_CONNECTIONS.forEach(() => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
      const line = new THREE.Line(geo, lineMat);
      scene.add(line);
      linesRef.current.push(line);
    });

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Skeleton based on current frame
  useEffect(() => {
    if (!frames || frames.length === 0 || !frames[currentFrameIndex]) return;

    const landmarks = frames[currentFrameIndex].landmarks;

    // Update Joints
    landmarks.forEach((lm, index) => {
      if (pointsRef.current[index]) {
        // MediaPipe world landmarks are metric. 
        // Y is usually inverted for graphics in some contexts, but let's see.
        // We flip X to mirror for natural viewing
        pointsRef.current[index].position.set(-lm.x, -lm.y + 1.5, lm.z); 
        // +1.5 to lift it up from floor roughly if data is centered at hip
        pointsRef.current[index].visible = true;
      }
    });

    // Update Bones (Lines)
    SKELETON_CONNECTIONS.forEach((pair, i) => {
      const idxA = pair[0];
      const idxB = pair[1];
      
      if (landmarks[idxA] && landmarks[idxB] && linesRef.current[i]) {
        const posA = pointsRef.current[idxA].position;
        const posB = pointsRef.current[idxB].position;
        
        const positions = new Float32Array([
          posA.x, posA.y, posA.z,
          posB.x, posB.y, posB.z
        ]);
        
        linesRef.current[i].geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        linesRef.current[i].geometry.attributes.position.needsUpdate = true;
      }
    });

  }, [frames, currentFrameIndex]);

  return (
    <div ref={mountRef} className="w-full h-full rounded-lg overflow-hidden shadow-xl" />
  );
};

export default ThreeVisualizer;