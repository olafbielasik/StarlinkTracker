import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as satellite from "satellite.js";

export default function StarlinkGlobe() {
  const mountRef = useRef(null);
  const tooltipRef = useRef(null);
  const satDataRef = useRef([]);
  const satGroupRef = useRef();
  const [filterHeight, setFilterHeight] = useState(0);
  const [satCount, setSatCount] = useState(0);

  useEffect(() => {
    let frameId;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const earthTexture = new THREE.TextureLoader().load("/texture.jpg");
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
    const earthMaterial = new THREE.MeshPhongMaterial({ map: earthTexture });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    const satGroup = new THREE.Group();
    satGroupRef.current = satGroup;
    scene.add(satGroup);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onMouseMove(event) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    window.addEventListener("mousemove", onMouseMove);

    async function loadTLEs() {
      const res = await fetch(
        "https://corsproxy.io/?https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"
      );
      const text = await res.text();
      const lines = text.trim().split("\n");
      const sats = [];

      for (let i = 0; i < lines.length; i += 3) {
        const name = lines[i].trim();
        const tle1 = lines[i + 1];
        const tle2 = lines[i + 2];
        const satrec = satellite.twoline2satrec(tle1, tle2);
        sats.push({ name, tle1, tle2, satrec });
      }

      satDataRef.current = sats;
      updateSatellites();
    }

    function updateSatellites() {
      satGroup.clear();
      const time = new Date();
      let visibleCount = 0;

      satDataRef.current.forEach((sat) => {
        const posVel = satellite.propagate(sat.satrec, time);
        if (!posVel.position) return;

        const gmst = satellite.gstime(time);
        const geo = satellite.eciToGeodetic(posVel.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lon = satellite.degreesLong(geo.longitude);
        const height = geo.height;

        if (height < filterHeight) return;

        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        const radius = 1.01 + height / 6371;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.003, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        dot.position.set(x, y, z);
        dot.userData = { name: sat.name, lat, lon };
        satGroup.add(dot);
        visibleCount++;
      });

      setSatCount(visibleCount);
    }

    function animate() {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(satGroupRef.current?.children || []);

      if (intersects.length > 0) {
        const { name, lat, lon } = intersects[0].object.userData;
        tooltipRef.current.style.display = "block";
        tooltipRef.current.style.left = `${mouse.x * window.innerWidth / 2 + window.innerWidth / 2}px`;
        tooltipRef.current.style.top = `${-mouse.y * window.innerHeight / 2 + window.innerHeight / 2}px`;
        tooltipRef.current.innerHTML = `<strong style='font-size: 1.2rem;'>${name}</strong><br/>Lat: ${lat.toFixed(
          2
        )}<br/>Lon: ${lon.toFixed(2)}`;
      } else {
        tooltipRef.current.style.display = "none";
      }

      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }

    loadTLEs();
    const interval = setInterval(updateSatellites, 20000);
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      clearInterval(interval);
      window.removeEventListener("mousemove", onMouseMove);
      mountRef.current.removeChild(renderer.domElement);
    };
  }, [filterHeight]);

  return (
    <>
      <div ref={mountRef} style={{ width: "100vw", height: "100vh", overflow: "hidden" }} />
      <div ref={tooltipRef} className="tooltip" />
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "1rem",
          borderRadius: "0.5rem",
        }}
      >
        <label>Minimum satellite height ({filterHeight} km): </label>
        <input
          type="range"
          min="0"
          max="2000"
          step="10"
          value={filterHeight}
          onChange={(e) => setFilterHeight(Number(e.target.value))}
        />
        <div>Visible satellites: {satCount}</div>
      </div>
    </>
  );
}
