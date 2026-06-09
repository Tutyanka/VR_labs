(() => {
  const { AFRAME, THREE } = window;

  function radiusOfZ(z, k) {
    const value = k * (1 - z) * z * z;
    return value > 0 ? Math.sqrt(value) : 0;
  }

  function buildDingDongGeometry(segU = 72, segV = 48, inflate = 1.0) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let j = 0; j <= segV; j += 1) {
      const v = j / segV;
      const z = -1 + 2 * v;
      const r = radiusOfZ(z, inflate);
      const drdz = r > 1e-6 ? (inflate * z * (2 - 3 * z)) / (2 * r) : 0;

      for (let i = 0; i <= segU; i += 1) {
        const u = i / segU;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const x = r * cosT;
        const y = r * sinT;

        positions.push(x, y, z);
        uvs.push(u, v);

        const tangentU = new THREE.Vector3(-r * sinT, r * cosT, 0);
        const tangentV = new THREE.Vector3(drdz * cosT, drdz * sinT, 1);
        const normal = new THREE.Vector3().crossVectors(tangentU, tangentV).normalize();
        normals.push(normal.x, normal.y, normal.z);
      }
    }

    for (let j = 0; j < segV; j += 1) {
      for (let i = 0; i < segU; i += 1) {
        const a = j * (segU + 1) + i;
        const b = a + 1;
        const c = a + segU + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  AFRAME.registerComponent("dingdong-surface", {
    init() {
      const group = new THREE.Group();

      const geometry = buildDingDongGeometry();
      const material = new THREE.MeshStandardMaterial({
        color: "#57b7d8",
        metalness: 0.24,
        roughness: 0.32,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(0.85);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.58;
      group.add(mesh);

      const edgeLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 22),
        new THREE.LineBasicMaterial({ color: "#173546", transparent: true, opacity: 0.72 })
      );
      edgeLines.scale.copy(mesh.scale);
      edgeLines.rotation.copy(mesh.rotation);
      edgeLines.position.copy(mesh.position);
      group.add(edgeLines);

      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.72, 64),
        new THREE.MeshBasicMaterial({
          color: "#d5962a",
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide
        })
      );
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 0.01;
      group.add(baseRing);

      const anchorPlate = new THREE.Mesh(
        new THREE.CircleGeometry(0.18, 48),
        new THREE.MeshStandardMaterial({
          color: "#f3efe5",
          emissive: "#5b4420",
          emissiveIntensity: 0.08,
          roughness: 0.88,
          side: THREE.DoubleSide
        })
      );
      anchorPlate.rotation.x = -Math.PI / 2;
      anchorPlate.position.y = 0.012;
      group.add(anchorPlate);

      this.group = group;
      this.mesh = mesh;
      this.edgeLines = edgeLines;
      this.baseRing = baseRing;
      this.el.setObject3D("mesh", group);
    },

    tick(time) {
      const wobble = Math.sin(time * 0.0018) * 0.08;
      const breathe = 1 + Math.sin(time * 0.0024) * 0.025;
      this.group.rotation.y += 0.0035;
      this.mesh.rotation.z = wobble;
      this.edgeLines.rotation.z = wobble;
      this.mesh.scale.setScalar(0.85 * breathe);
      this.edgeLines.scale.setScalar(0.85 * breathe);
      this.baseRing.material.opacity = 0.32 + Math.sin(time * 0.002) * 0.08;
    },

    remove() {
      this.el.removeObject3D("mesh");
    }
  });
})();
