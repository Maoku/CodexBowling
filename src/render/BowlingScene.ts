import * as THREE from "three";
import {
  BALL_RADIUS,
  BALL_START_Z,
  BOWLING_DIMENSIONS,
  HEAD_PIN_Z,
  LANE_CENTER_Z,
  LANE_HALF_WIDTH,
  PIN_BASE_RADIUS,
  PIN_MAX_RADIUS,
} from "../game/content/bowlingDimensions";
import { SIGNAGE_TEXT, bowlerDisplayName } from "../game/content/text";
import { SCENE_TUNING } from "../game/content/tuning";
import type { MatchSnapshot, ThrowParams } from "../game/types";
import type { PhysicsSnapshot } from "../physics/BowlingPhysics";

export class BowlingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(SCENE_TUNING.cameraFovDegrees, 1, SCENE_TUNING.cameraNearMeters, SCENE_TUNING.cameraFarMeters);
  private ballMesh: THREE.Mesh;
  private pinMeshes = new Map<number, THREE.Group>();
  private aimLine: THREE.Mesh;
  private aimHead: THREE.Mesh;
  private laneStartMarker: THREE.Mesh;
  private signageCanvas = document.createElement("canvas");
  private signageContext: CanvasRenderingContext2D;
  private signageTexture: THREE.CanvasTexture;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, SCENE_TUNING.maxDevicePixelRatio));
    this.scene.background = new THREE.Color("#10131f");
    this.scene.fog = new THREE.Fog("#10131f", SCENE_TUNING.fogNearMeters, SCENE_TUNING.fogFarMeters);
    this.signageCanvas.width = SCENE_TUNING.signageCanvasWidth;
    this.signageCanvas.height = SCENE_TUNING.signageCanvasHeight;
    const context = this.signageCanvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create signage canvas context.");
    }
    this.signageContext = context;
    this.signageTexture = new THREE.CanvasTexture(this.signageCanvas);
    this.signageTexture.colorSpace = THREE.SRGBColorSpace;

    this.createLights();
    this.createEnvironment();
    this.ballMesh = this.createBall();
    this.aimLine = this.createAimLine();
    this.aimHead = this.createAimHead();
    this.laneStartMarker = this.createLaneStartMarker();

    for (let id = 1; id <= 10; id += 1) {
      const pin = this.createPinMesh(id);
      this.pinMeshes.set(id, pin);
      this.scene.add(pin);
    }

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  updateAim(params: ThrowParams): void {
    this.laneStartMarker.position.x = params.laneOffset;
    const direction = new THREE.Vector3(Math.sin(params.angle), 0, -Math.cos(params.angle));
    const start = new THREE.Vector3(params.laneOffset, 0.025, BALL_START_Z);
    const length = SCENE_TUNING.aimingArrowLengthMeters;
    const center = start.clone().add(direction.clone().multiplyScalar(length / 2));
    this.aimLine.position.copy(center);
    this.aimLine.scale.set(1, length, 1);
    this.aimLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.aimHead.position.copy(start.clone().add(direction.clone().multiplyScalar(length)));
    this.aimHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  }

  sync(snapshot: PhysicsSnapshot, phase: string): void {
    const ball = snapshot.ball;
    this.ballMesh.position.set(ball.position.x, ball.position.y, ball.position.z);
    this.ballMesh.quaternion.set(ball.rotation.x, ball.rotation.y, ball.rotation.z, ball.rotation.w);

    snapshot.pins.forEach((pin) => {
      const mesh = this.pinMeshes.get(pin.id);
      if (!mesh) return;
      mesh.position.set(pin.position.x, pin.position.y, pin.position.z);
      mesh.quaternion.set(pin.rotation.x, pin.rotation.y, pin.rotation.z, pin.rotation.w);
    });

    if (phase === "rolling") {
      const targetZ = THREE.MathUtils.clamp(
        ball.position.z + SCENE_TUNING.rollingCameraAheadMeters,
        HEAD_PIN_Z + SCENE_TUNING.rollingCameraMinZFromHeadPinMeters,
        SCENE_TUNING.rollingCameraMaxZ,
      );
      this.camera.position.lerp(
        new THREE.Vector3(ball.position.x * SCENE_TUNING.rollingCameraBallXScale, SCENE_TUNING.rollingCameraY, targetZ),
        SCENE_TUNING.rollingCameraLerp,
      );
      this.camera.lookAt(ball.position.x * SCENE_TUNING.rollingCameraTargetXScale, 0.1, ball.position.z - SCENE_TUNING.rollingCameraMinZFromHeadPinMeters);
    } else if (phase === "settling") {
      this.camera.position.lerp(new THREE.Vector3(0, SCENE_TUNING.settlingCameraY, HEAD_PIN_Z + SCENE_TUNING.settlingCameraZFromHeadPinMeters), SCENE_TUNING.settlingCameraLerp);
      this.camera.lookAt(0, SCENE_TUNING.cameraLookAtY, HEAD_PIN_Z - SCENE_TUNING.rollingCameraAheadMeters);
    } else {
      this.camera.position.lerp(new THREE.Vector3(0, SCENE_TUNING.idleCameraY, SCENE_TUNING.idleCameraZ), SCENE_TUNING.idleCameraLerp);
      this.camera.lookAt(0, SCENE_TUNING.cameraLookAtY, HEAD_PIN_Z);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  updateSignage(snapshot: MatchSnapshot): void {
    const ctx = this.signageContext;
    const w = this.signageCanvas.width;
    const h = this.signageCanvas.height;
    const resultText = signageResultText(snapshot);
    const activeName = bowlerDisplayName(snapshot.activeBowler).toUpperCase();

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#171b33");
    gradient.addColorStop(0.45, "#27133b");
    gradient.addColorStop(1, "#092f3d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255, 121, 173, 0.22)";
    for (let x = -80; x < w; x += 170) {
      ctx.fillRect(x, 0, 44, h);
    }

    ctx.strokeStyle = "#83eff7";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = "#ffe45c";
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    ctx.fillStyle = "#83eff7";
    ctx.font = "800 38px Segoe UI, sans-serif";
    ctx.fillText(`FRAME ${Math.min(snapshot.activeFrame + 1, 5)} / 5  ${activeName}`, 46, 64);

    ctx.fillStyle = resultText.color;
    ctx.font = "900 82px Segoe UI, sans-serif";
    ctx.fillText(resultText.label, 46, 150);

    ctx.fillStyle = "#fff8f3";
    ctx.font = "800 34px Segoe UI, sans-serif";
    ctx.fillText(`MAO ${snapshot.playerScore.total}`, 660, 92);
    ctx.fillText(`RINKA ${snapshot.rivalScore.total}`, 660, 142);

    ctx.fillStyle = "#ffd481";
    ctx.font = "700 26px Segoe UI, sans-serif";
    ctx.fillText(snapshot.message.slice(0, SCENE_TUNING.signageMessageMaxChars), 46, 210);

    this.signageTexture.needsUpdate = true;
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private createLights(): void {
    const ambient = new THREE.HemisphereLight("#fbf7ff", "#343955", 1.6);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight("#ffffff", 3.6);
    key.position.set(-2.5, 6, 1.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -21;
    this.scene.add(key);

    const rim = new THREE.PointLight("#ff8fc8", 4.8, 16);
    rim.position.set(1.2, 1.8, HEAD_PIN_Z + 1.2);
    this.scene.add(rim);
  }

  private createEnvironment(): void {
    const laneMaterial = new THREE.MeshStandardMaterial({
      color: "#e6b66c",
      roughness: 0.42,
      metalness: 0.05,
    });
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth, 0.08, BOWLING_DIMENSIONS.laneEndFromFoulLine),
      laneMaterial,
    );
    lane.position.set(0, -0.05, LANE_CENTER_Z);
    lane.receiveShadow = true;
    this.scene.add(lane);

    const boardMaterial = new THREE.MeshStandardMaterial({ color: "#f4ca83", roughness: 0.5 });
    const boardWidth = BOWLING_DIMENSIONS.laneWidth / 39;
    for (let i = -19; i <= 19; i += 1) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.003, 0.012, BOWLING_DIMENSIONS.laneEndFromFoulLine - 0.08),
        boardMaterial,
      );
      stripe.position.set(i * boardWidth, 0.004, LANE_CENTER_Z);
      this.scene.add(stripe);
    }

    const gutterMaterial = new THREE.MeshStandardMaterial({
      color: "#232634",
      roughness: 0.58,
      metalness: 0.18,
    });
    const gutterX = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth / 2;
    [-gutterX, gutterX].forEach((x) => {
      const gutter = new THREE.Mesh(
        new THREE.BoxGeometry(BOWLING_DIMENSIONS.gutterWidth, 0.08, BOWLING_DIMENSIONS.laneEndFromFoulLine),
        gutterMaterial,
      );
      gutter.position.set(x, -0.16, LANE_CENTER_Z);
      gutter.receiveShadow = true;
      this.scene.add(gutter);
    });

    const sideWallMaterial = new THREE.MeshStandardMaterial({ color: "#10131f", roughness: 0.7 });
    const sideWallOffset = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth + 0.04;
    [-sideWallOffset, sideWallOffset].forEach((x) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, BOWLING_DIMENSIONS.laneEndFromFoulLine), sideWallMaterial);
      wall.position.set(x, -0.02, LANE_CENTER_Z);
      wall.receiveShadow = true;
      this.scene.add(wall);
    });

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth + BOWLING_DIMENSIONS.gutterWidth * 2, 0.15, 1.25),
      new THREE.MeshStandardMaterial({ color: "#1a2035", roughness: 0.66 }),
    );
    deck.position.set(0, -0.04, HEAD_PIN_Z - 0.45);
    deck.receiveShadow = true;
    this.scene.add(deck);

    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth + BOWLING_DIMENSIONS.gutterWidth * 2, 0.1, 1.7),
      new THREE.MeshStandardMaterial({ color: "#090b13", roughness: 0.82 }),
    );
    pit.position.set(0, -0.32, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 0.8);
    pit.receiveShadow = true;
    this.scene.add(pit);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.95, 0.18),
      new THREE.MeshStandardMaterial({ color: "#242a48", roughness: 0.6 }),
    );
    back.position.set(0, 0.45, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.9);
    back.receiveShadow = true;
    this.scene.add(back);

    const signage = new THREE.Mesh(
      new THREE.PlaneGeometry(2.25, 0.56),
      new THREE.MeshBasicMaterial({ map: this.signageTexture, toneMapped: false }),
    );
    signage.position.set(0, 1.16, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.78);
    this.scene.add(signage);

    const sideGlowMaterial = new THREE.MeshBasicMaterial({ color: "#f47fb1" });
    [-LANE_HALF_WIDTH, LANE_HALF_WIDTH].forEach((x) => {
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.2), sideGlowMaterial);
      glow.position.set(x, 0.045, LANE_CENTER_Z - 0.45);
      this.scene.add(glow);
    });
  }

  private createBall(): THREE.Mesh {
    const geometry = new THREE.IcosahedronGeometry(BALL_RADIUS, 4);
    const material = new THREE.MeshStandardMaterial({
      color: "#ff79ad",
      roughness: 0.28,
      metalness: 0.18,
    });
    const ball = new THREE.Mesh(geometry, material);
    ball.castShadow = true;
    ball.receiveShadow = true;
    this.scene.add(ball);

    const fingerMaterial = new THREE.MeshStandardMaterial({ color: "#35203a", roughness: 0.6 });
    const holes = [
      new THREE.Vector3(0.038, 0.078, 0.052),
      new THREE.Vector3(-0.006, 0.084, 0.064),
      new THREE.Vector3(0.018, 0.052, 0.085),
    ];
    holes.forEach((position) => {
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), fingerMaterial);
      hole.position.copy(position);
      ball.add(hole);
    });

    return ball;
  }

  private createPinMesh(id: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `pin-${id}`;

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#fff8ef", roughness: 0.44 });
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: "#ff517c", roughness: 0.38 });

    const h = BOWLING_DIMENSIONS.pinHeight;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PIN_BASE_RADIUS * 0.9, PIN_BASE_RADIUS, h * 0.2, 10), bodyMaterial);
    base.position.y = -h * 0.37;
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(PIN_MAX_RADIUS * 0.68, PIN_MAX_RADIUS, h * 0.32, 10), bodyMaterial);
    belly.position.y = -h * 0.14;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(PIN_MAX_RADIUS * 0.34, PIN_MAX_RADIUS * 0.52, h * 0.28, 10), bodyMaterial);
    neck.position.y = h * 0.14;
    const head = new THREE.Mesh(new THREE.SphereGeometry(PIN_MAX_RADIUS * 0.72, 12, 8), bodyMaterial);
    head.position.y = h * 0.38;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(PIN_MAX_RADIUS * 0.43, PIN_MAX_RADIUS * 0.5, h * 0.05, 10), stripeMaterial);
    stripe.position.y = h * 0.21;

    [base, belly, neck, head, stripe].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    return group;
  }

  private createAimLine(): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.026, 0.026, 1, 12);
    const material = new THREE.MeshBasicMaterial({ color: "#ffe45c" });
    const line = new THREE.Mesh(geometry, material);
    line.position.set(0, 0.035, BALL_START_Z - 1.7);
    this.scene.add(line);
    return line;
  }

  private createAimHead(): THREE.Mesh {
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, 0.28, 18),
      new THREE.MeshBasicMaterial({ color: "#83eff7" }),
    );
    head.position.set(0, 0.035, BALL_START_Z - 3.4);
    this.scene.add(head);
    return head;
  }

  private createLaneStartMarker(): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_RADIUS * 1.7, 0.008, 8, 30),
      new THREE.MeshBasicMaterial({ color: "#98f8ff" }),
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.set(0, 0.018, BALL_START_Z);
    this.scene.add(marker);
    return marker;
  }
}

function signageResultText(snapshot: MatchSnapshot): { label: string; color: string } {
  const result = snapshot.lastResult;
  if (!result) return { label: SIGNAGE_TEXT.ready, color: "#fff8f3" };
  if (snapshot.phase === "matchComplete") return { label: SIGNAGE_TEXT.final, color: "#ffe45c" };
  if (result.isStrike) return { label: SIGNAGE_TEXT.strike, color: "#ff79ad" };
  if (result.isSpare) return { label: SIGNAGE_TEXT.spare, color: "#83eff7" };
  if (result.knockedPins === 0) return { label: SIGNAGE_TEXT.gutter, color: "#ff5555" };
  return { label: SIGNAGE_TEXT.pins(result.knockedPins), color: "#fff8f3" };
}
