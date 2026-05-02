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
import { SCENE_TUNING, TIMING_TUNING } from "../game/content/tuning";
import type { BowlerId, MatchPhase, MatchSnapshot, ThrowParams, ThrowResult } from "../game/types";
import type { PhysicsSnapshot } from "../physics/BowlingPhysics";

type CharacterScenePlacement = {
  mode: "scene";
  laneOffset: number;
  y: number;
  zFromBallStart: number;
  scale: number;
};

type CharacterCameraPlacement = {
  mode: "camera";
  right: number;
  up: number;
  forward: number;
  scale: number;
};

type CharacterThrowAnimationTiming = {
  frameDurationsMs: readonly number[];
  hideAfterLastFrameMs: number;
};

const THROW_PRE_RELEASE_FRAME_1_MS = 260;
const THROW_PRE_RELEASE_FRAME_2_MS = 300;
const THROW_RELEASE_FRAME_DURATION_MS = 260;
const THROW_RELEASE_FRAME_START_MS = TIMING_TUNING.throwReleaseDelayMs;
const THROW_PRE_RELEASE_FRAME_3_MS = THROW_RELEASE_FRAME_START_MS - THROW_PRE_RELEASE_FRAME_1_MS - THROW_PRE_RELEASE_FRAME_2_MS;

const CHARACTER_BILLBOARD_SETTINGS = {
  atlasFrameWidthPx: 512,
  heightMeters: 1.5,
  throwAnimation: {
    frameDurationsMs: [
      THROW_PRE_RELEASE_FRAME_1_MS,
      THROW_PRE_RELEASE_FRAME_2_MS,
      THROW_PRE_RELEASE_FRAME_3_MS,
      THROW_RELEASE_FRAME_DURATION_MS,
    ],
    hideAfterLastFrameMs: 1,
  },
  uiOverlapOpacity: 0.38,
  throwAtlasColumns: 4,
  reactionAtlasColumns: 4,
  beforeThrow: {
    mode: "scene",
    laneOffset: -0.3,
    y: 0.0,
    zFromBallStart: -0.0,
    scale: 1.0,
  },
  throwing: {
    mode: "camera",
    right: -0.24,
    up: -0.08,
    forward: 0.92,
    scale: 1,
  },
  afterThrow: {
    mode: "scene",
    laneOffset: -0.0,
    y: 0.0,
    zFromBallStart: -0.0,
    scale: 1.0,
  },
  happyBounceMeters: 0.08,
  happyBounceMs: 135,
} as const satisfies {
  atlasFrameWidthPx: number;
  heightMeters: number;
  throwAnimation: CharacterThrowAnimationTiming;
  uiOverlapOpacity: number;
  throwAtlasColumns: number;
  reactionAtlasColumns: number;
  beforeThrow: CharacterScenePlacement;
  throwing: CharacterCameraPlacement;
  afterThrow: CharacterScenePlacement;
  happyBounceMeters: number;
  happyBounceMs: number;
};

export class BowlingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(SCENE_TUNING.cameraFovDegrees, 1, SCENE_TUNING.cameraNearMeters, SCENE_TUNING.cameraFarMeters);
  private textureLoader = new THREE.TextureLoader();
  private toonGradient = createToonGradientTexture();
  private outlineMaterial = new THREE.MeshBasicMaterial({ color: "#181125", side: THREE.BackSide });
  private ballMaterial = new THREE.MeshToonMaterial({
    color: "#ff79ad",
    gradientMap: this.toonGradient,
  });
  private ballReflectionMaterial = new THREE.MeshBasicMaterial({
    color: "#ff9bc4",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private characterThrowTextures: Record<BowlerId, THREE.Texture>;
  private characterReactionTextures: Record<BowlerId, THREE.Texture>;
  private characterBillboardMaterial: THREE.MeshBasicMaterial;
  private characterBillboard: THREE.Mesh;
  private ballMesh: THREE.Mesh;
  private ballReflectionMesh: THREE.Mesh;
  private pinMeshes = new Map<number, THREE.Group>();
  private aimLine: THREE.Mesh;
  private aimHead: THREE.Mesh;
  private laneStartMarker: THREE.Mesh;
  private signageCanvas = document.createElement("canvas");
  private signageContext: CanvasRenderingContext2D;
  private signageTexture: THREE.CanvasTexture;
  private aimLaneOffset = 0;
  private throwLaneOffset = 0;
  private lastCharacterStateKey = "";
  private throwBillboardStartedAt = 0;

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
    this.characterThrowTextures = {
      player: this.createAtlasTexture("/assets/player-billboard-throw-atlas.png", CHARACTER_BILLBOARD_SETTINGS.throwAtlasColumns),
      rival: this.createAtlasTexture("/assets/rival-billboard-throw-atlas.png", CHARACTER_BILLBOARD_SETTINGS.throwAtlasColumns),
    };
    this.characterReactionTextures = {
      player: this.createAtlasTexture("/assets/player-billboard-reaction-atlas.png", CHARACTER_BILLBOARD_SETTINGS.reactionAtlasColumns),
      rival: this.createAtlasTexture("/assets/rival-billboard-reaction-atlas.png", CHARACTER_BILLBOARD_SETTINGS.reactionAtlasColumns),
    };
    this.characterBillboardMaterial = new THREE.MeshBasicMaterial({
      map: this.characterThrowTextures.player,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.createLights();
    this.createEnvironment();
    this.ballMesh = this.createBall();
    this.ballReflectionMesh = this.createBallReflection();
    this.characterBillboard = this.createCharacterBillboard();
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
    this.aimLaneOffset = params.laneOffset;
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

  setThrowLaneOffset(laneOffset: number): void {
    this.throwLaneOffset = laneOffset;
  }

  startThrowBillboardClock(startedAt: number): void {
    this.throwBillboardStartedAt = startedAt;
  }

  sync(snapshot: PhysicsSnapshot, matchSnapshot: MatchSnapshot): void {
    const ball = snapshot.ball;
    const phase = matchSnapshot.phase;
    const activeBowler = matchSnapshot.activeBowler;
    this.updateBallMaterial(activeBowler);
    this.ballMesh.position.set(ball.position.x, ball.position.y, ball.position.z);
    this.ballMesh.quaternion.set(ball.rotation.x, ball.rotation.y, ball.rotation.z, ball.rotation.w);
    this.ballReflectionMesh.position.set(ball.position.x, 0.011, ball.position.z);
    this.ballReflectionMesh.quaternion.set(ball.rotation.x, ball.rotation.y, ball.rotation.z, ball.rotation.w);
    const laneFade = THREE.MathUtils.smoothstep(ball.position.z, HEAD_PIN_Z - 0.7, BALL_START_Z + 0.4);
    this.ballReflectionMaterial.opacity = THREE.MathUtils.clamp(0.08 + laneFade * 0.2, 0.08, 0.28);

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
    this.updateCharacterBillboard(matchSnapshot);
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
    const celebration =
      snapshot.phase === "showingResult" && snapshot.lastResult?.isStrike
        ? "strike"
        : snapshot.phase === "showingResult" && snapshot.lastResult?.isSpare
          ? "spare"
          : "none";

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    if (celebration === "strike") {
      gradient.addColorStop(0, "#2b0028");
      gradient.addColorStop(0.48, "#56003a");
      gradient.addColorStop(1, "#00334e");
    } else if (celebration === "spare") {
      gradient.addColorStop(0, "#003246");
      gradient.addColorStop(0.5, "#0055a6");
      gradient.addColorStop(1, "#3a0062");
    } else {
      gradient.addColorStop(0, "#060b24");
      gradient.addColorStop(0.46, "#310047");
      gradient.addColorStop(1, "#003650");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    if (celebration !== "none") {
      const cx = w * 0.52;
      const cy = h * 0.52;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((performance.now() / 420) % (Math.PI * 2));
      ctx.strokeStyle = celebration === "strike" ? "rgba(255, 228, 92, 0.58)" : "rgba(131, 239, 247, 0.52)";
      ctx.lineWidth = 18;
      for (let i = 0; i < 28; i += 1) {
        ctx.rotate((Math.PI * 2) / 28);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255, 64, 210, 0.2)";
      for (let x = -80; x < w; x += 170) {
        ctx.fillRect(x, 0, 44, h);
      }
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.fillRect(34, 76, 580, 94);
    ctx.fillRect(634, 62, 300, 102);

    ctx.shadowColor = "rgba(0, 245, 255, 1)";
    ctx.shadowBlur = 26;
    ctx.strokeStyle = "#00f5ff";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.shadowColor = "rgba(255, 238, 0, 1)";
    ctx.shadowBlur = 22;
    ctx.strokeStyle = "#ffee00";
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    ctx.shadowColor = "rgba(0, 245, 255, 1)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#00f5ff";
    ctx.font = "900 42px Segoe UI, sans-serif";
    ctx.fillText(`FRAME ${Math.min(snapshot.activeFrame + 1, 5)} / 5  ${activeName}`, 46, 64);

    ctx.shadowColor = resultText.color;
    ctx.shadowBlur = celebration === "none" ? 26 : 42;
    ctx.fillStyle = resultText.color;
    ctx.font = "900 92px Segoe UI, sans-serif";
    ctx.fillText(resultText.label, 46, 154);

    ctx.shadowColor = "rgba(255, 248, 243, 1)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#fff8f3";
    ctx.font = "900 38px Segoe UI, sans-serif";
    ctx.fillText(`MAO ${snapshot.playerScore.total}`, 660, 94);
    ctx.fillText(`RINKA ${snapshot.rivalScore.total}`, 660, 146);

    ctx.shadowColor = "rgba(255, 210, 0, 0.95)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffd200";
    ctx.font = "700 26px Segoe UI, sans-serif";
    ctx.fillText(snapshot.message.slice(0, SCENE_TUNING.signageMessageMaxChars), 46, 210);
    ctx.shadowBlur = 0;

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

    const key = new THREE.DirectionalLight("#ffffff", 2.6);
    key.position.set(-2.5, 6, 1.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -21;
    this.scene.add(key);

    const signageGlow = new THREE.PointLight("#ff4fc3", 10.5, 16);
    signageGlow.position.set(0, 2.1, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.3);
    this.scene.add(signageGlow);

    const signageCyanGlow = new THREE.PointLight("#83eff7", 7.2, 14);
    signageCyanGlow.position.set(0, 1.7, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.1);
    this.scene.add(signageCyanGlow);

  }

  private createEnvironment(): void {
    this.createBowlingAlleyShell();

    const laneTexture = this.textureLoader.load("/assets/lane-toon-wood.png");
    laneTexture.colorSpace = THREE.SRGBColorSpace;
    laneTexture.wrapS = THREE.RepeatWrapping;
    laneTexture.wrapT = THREE.RepeatWrapping;
    laneTexture.repeat.set(1.2, 10);
    laneTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    const laneMaterial = new THREE.MeshPhysicalMaterial({
      color: "#f4c678",
      map: laneTexture,
      roughness: 0.74,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 1,
      reflectivity: 0.05,
    });
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth, 0.08, BOWLING_DIMENSIONS.laneEndFromFoulLine),
      laneMaterial,
    );
    lane.position.set(0, -0.05, LANE_CENTER_Z);
    lane.receiveShadow = true;
    this.scene.add(lane);

    const gutterMaterial = new THREE.MeshToonMaterial({
      color: "#232634",
      gradientMap: this.toonGradient,
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

    const sideWallMaterial = new THREE.MeshToonMaterial({ color: "#10131f", gradientMap: this.toonGradient });
    const sideWallOffset = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth + 0.04;
    [-sideWallOffset, sideWallOffset].forEach((x) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, BOWLING_DIMENSIONS.laneEndFromFoulLine), sideWallMaterial);
      wall.position.set(x, -0.02, LANE_CENTER_Z);
      wall.receiveShadow = true;
      this.scene.add(wall);
    });

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth + BOWLING_DIMENSIONS.gutterWidth * 2, 0.15, 1.25),
      new THREE.MeshToonMaterial({ color: "#1a2035", gradientMap: this.toonGradient }),
    );
    deck.position.set(0, -0.04, HEAD_PIN_Z - 0.45);
    deck.receiveShadow = true;
    this.scene.add(deck);

    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth + BOWLING_DIMENSIONS.gutterWidth * 2, 0.1, 1.7),
      new THREE.MeshToonMaterial({ color: "#090b13", gradientMap: this.toonGradient }),
    );
    pit.position.set(0, -0.32, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 0.8);
    pit.receiveShadow = true;
    this.scene.add(pit);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(SCENE_TUNING.signagePlaneWidthMeters + 0.35, SCENE_TUNING.signagePlaneHeightMeters + 0.35, 0.18),
      new THREE.MeshToonMaterial({ color: "#242a48", gradientMap: this.toonGradient }),
    );
    back.position.set(0, 1.65, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.9);
    back.receiveShadow = true;
    this.scene.add(back);

    const signageGlowPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(SCENE_TUNING.signagePlaneWidthMeters + 0.9, SCENE_TUNING.signagePlaneHeightMeters + 0.55),
      new THREE.MeshBasicMaterial({
        color: "#ff1ed2",
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    signageGlowPanel.position.set(0, 2.08, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.805);
    this.scene.add(signageGlowPanel);

    const signageCyanHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(SCENE_TUNING.signagePlaneWidthMeters + 0.45, SCENE_TUNING.signagePlaneHeightMeters + 0.22),
      new THREE.MeshBasicMaterial({
        color: "#00f5ff",
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    signageCyanHalo.position.set(0, 2.08, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.797);
    this.scene.add(signageCyanHalo);

    const signage = new THREE.Mesh(
      new THREE.PlaneGeometry(SCENE_TUNING.signagePlaneWidthMeters, SCENE_TUNING.signagePlaneHeightMeters),
      new THREE.MeshBasicMaterial({ map: this.signageTexture, toneMapped: false, color: "#ffffff" }),
    );
    signage.position.set(0, 2.08, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.78);
    this.scene.add(signage);
    this.createSignageBulbs();
    this.createPinsetterDetails();

    this.createLaneMarkings();
  }

  private createBowlingAlleyShell(): void {
    const floorMaterial = new THREE.MeshToonMaterial({ color: "#161927", gradientMap: this.toonGradient });
    const wallMaterial = new THREE.MeshToonMaterial({ color: "#202540", gradientMap: this.toonGradient });
    const accentMaterial = new THREE.MeshToonMaterial({ color: "#2f365c", gradientMap: this.toonGradient });
    const approachMaterial = new THREE.MeshToonMaterial({ color: "#b48755", gradientMap: this.toonGradient });
    const lightMaterial = new THREE.MeshBasicMaterial({ color: "#dce8ff" });
    const adjacentLaneMaterial = new THREE.MeshToonMaterial({ color: "#5f432d", gradientMap: this.toonGradient });
    const trimMaterial = new THREE.MeshBasicMaterial({ color: "#5a638a", toneMapped: false });
    const cyanTrimMaterial = new THREE.MeshBasicMaterial({ color: "#83eff7", toneMapped: false });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.08, BOWLING_DIMENSIONS.laneEndFromFoulLine + 8.2), floorMaterial);
    floor.position.set(0, -0.28, LANE_CENTER_Z + 0.9);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const approach = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.07, 4.6), approachMaterial);
    approach.position.set(0, -0.11, 2.15);
    approach.receiveShadow = true;
    this.scene.add(approach);

    [-2.45, 2.45].forEach((x) => {
      const sideLane = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, BOWLING_DIMENSIONS.laneEndFromFoulLine), adjacentLaneMaterial);
      sideLane.position.set(x, -0.12, LANE_CENTER_Z);
      sideLane.receiveShadow = true;
      this.scene.add(sideLane);

      const laneEdge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, BOWLING_DIMENSIONS.laneEndFromFoulLine - 0.4), cyanTrimMaterial);
      laneEdge.position.set(x - Math.sign(x) * 0.74, -0.07, LANE_CENTER_Z - 0.1);
      this.scene.add(laneEdge);

      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, BOWLING_DIMENSIONS.laneEndFromFoulLine + 5.2), wallMaterial);
      wall.position.set(Math.sign(x) * 4.05, 1.88, LANE_CENTER_Z + 0.65);
      wall.receiveShadow = true;
      this.scene.add(wall);

      const wallStripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, BOWLING_DIMENSIONS.laneEndFromFoulLine + 4.5), x < 0 ? trimMaterial : cyanTrimMaterial);
      wallStripe.position.set(Math.sign(x) * 3.945, 2.6, LANE_CENTER_Z + 0.45);
      this.scene.add(wallStripe);
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.25, 0.18), wallMaterial);
    backWall.position.set(0, 1.95, -BOWLING_DIMENSIONS.laneEndFromFoulLine - 2.15);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.08, BOWLING_DIMENSIONS.laneEndFromFoulLine + 6.5), accentMaterial);
    ceiling.position.set(0, 4.08, LANE_CENTER_Z + 0.05);
    this.scene.add(ceiling);

    for (let z = BALL_START_Z - 1.6; z > HEAD_PIN_Z - 0.8; z -= 5.2) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.025, 0.46), lightMaterial);
      light.position.set(0, 4.02, z);
      this.scene.add(light);
    }

    const ballReturn = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.22, 5.35),
      new THREE.MeshToonMaterial({ color: "#27304f", gradientMap: this.toonGradient }),
    );
    ballReturn.position.set(1.7, 0.01, 0.05);
    ballReturn.receiveShadow = true;
    this.scene.add(ballReturn);

    const ballReturnRail = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.035, 5.15), new THREE.MeshBasicMaterial({ color: "#ffd481", toneMapped: false }));
    ballReturnRail.position.set(1.7, 0.15, 0.05);
    this.scene.add(ballReturnRail);

    this.createHouseBalls();
    this.createSeatingArea();
    this.createOverheadMonitors();
  }

  private createSignageBulbs(): void {
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: "#ffe45c", toneMapped: false });
    const bulbGlowMaterial = new THREE.MeshBasicMaterial({ color: "#ff9f4d", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const z = -BOWLING_DIMENSIONS.laneEndFromFoulLine - 1.735;
    const centerY = 2.08;
    const halfW = SCENE_TUNING.signagePlaneWidthMeters / 2 + 0.16;
    const halfH = SCENE_TUNING.signagePlaneHeightMeters / 2 + 0.14;
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i += 1) {
      const x = THREE.MathUtils.lerp(-halfW, halfW, i / 10);
      points.push([x, centerY - halfH], [x, centerY + halfH]);
    }
    for (let i = 1; i <= 3; i += 1) {
      const y = THREE.MathUtils.lerp(centerY - halfH, centerY + halfH, i / 4);
      points.push([-halfW, y], [halfW, y]);
    }
    points.forEach(([x, y], index) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), index % 2 === 0 ? bulbMaterial : bulbGlowMaterial);
      bulb.position.set(x, y, z);
      this.scene.add(bulb);
    });
  }

  private createPinsetterDetails(): void {
    const hoodMaterial = new THREE.MeshToonMaterial({ color: "#202747", gradientMap: this.toonGradient });
    const accentMaterial = new THREE.MeshBasicMaterial({ color: "#ff79ad", toneMapped: false });
    const metalMaterial = new THREE.MeshToonMaterial({ color: "#404967", gradientMap: this.toonGradient });

    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.36, 0.32), hoodMaterial);
    hood.position.set(0, 0.58, HEAD_PIN_Z - 0.55);
    hood.castShadow = true;
    hood.receiveShadow = true;
    this.scene.add(hood);

    [-0.88, 0.88].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10), metalMaterial);
      post.position.set(x, 0.34, HEAD_PIN_Z - 0.33);
      post.castShadow = true;
      this.scene.add(post);
    });

    const logoStrip = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.055, 0.02), accentMaterial);
    logoStrip.position.set(0, 0.64, HEAD_PIN_Z - 0.385);
    this.scene.add(logoStrip);
  }

  private createLaneMarkings(): void {
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: "#fff4a8", transparent: true, opacity: 0.9, toneMapped: false });
    const dotMaterial = new THREE.MeshBasicMaterial({ color: "#83eff7", transparent: true, opacity: 0.62, toneMapped: false });
    const boardWidth = BOWLING_DIMENSIONS.laneWidth / 39;

    [-12, -6, 0, 6, 12].forEach((boardIndex) => {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 3), arrowMaterial);
      arrow.scale.setScalar(0.72);
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = Math.PI;
      arrow.position.set(boardIndex * boardWidth, 0.018, BALL_START_Z - 4.35);
      this.scene.add(arrow);
    });

    [-10, -5, 0, 5, 10].forEach((boardIndex) => {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.028, 18), dotMaterial);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(boardIndex * boardWidth, 0.019, BALL_START_Z - 2.05);
      this.scene.add(dot);
    });

    const foulLine = new THREE.Mesh(new THREE.BoxGeometry(BOWLING_DIMENSIONS.laneWidth + 0.2, 0.012, 0.035), new THREE.MeshBasicMaterial({ color: "#a88952", toneMapped: false }));
    foulLine.position.set(0, 0.022, BALL_START_Z + 0.18);
    this.scene.add(foulLine);
  }

  private createHouseBalls(): void {
    const colors = ["#ff79ad", "#3db7ff", "#ffe45c", "#90f7b4", "#b889ff"];
    colors.forEach((color, index) => {
      const ball = new THREE.Mesh(
        new THREE.IcosahedronGeometry(BALL_RADIUS * 0.92, 3),
        new THREE.MeshToonMaterial({ color, gradientMap: this.toonGradient, emissive: color, emissiveIntensity: 0.08 }),
      );
      ball.position.set(1.7 + (index % 2) * 0.03, 0.31 + Math.floor(index / 2) * 0.16, 1.18 - index * 0.55);
      ball.castShadow = true;
      this.scene.add(ball);
    });
  }

  private createSeatingArea(): void {
    const seatMaterial = new THREE.MeshToonMaterial({ color: "#ff8fbd", gradientMap: this.toonGradient });
    const baseMaterial = new THREE.MeshToonMaterial({ color: "#242a48", gradientMap: this.toonGradient });
    [-2.05, 2.65].forEach((x) => {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.18, 0.36), seatMaterial);
      bench.position.set(x, 0.02, 1.68);
      bench.castShadow = true;
      bench.receiveShadow = true;
      this.scene.add(bench);

      const back = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.46, 0.12), seatMaterial);
      back.position.set(x, 0.28, 1.88);
      back.castShadow = true;
      this.scene.add(back);

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.28), baseMaterial);
      base.position.set(x, -0.12, 1.68);
      base.castShadow = true;
      this.scene.add(base);
    });
  }

  private createOverheadMonitors(): void {
    const frameMaterial = new THREE.MeshToonMaterial({ color: "#111827", gradientMap: this.toonGradient });
    const screenMaterial = new THREE.MeshBasicMaterial({ color: "#193f65", toneMapped: false });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: "#83eff7", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

    [-1.45, 1.45].forEach((x) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.56, 0.08), frameMaterial);
      frame.position.set(x, 1.32, BALL_START_Z - 1.85);
      frame.rotation.x = -0.18;
      this.scene.add(frame);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.4), screenMaterial);
      screen.position.set(x, 1.32, BALL_START_Z - 1.805);
      screen.rotation.x = -0.18;
      this.scene.add(screen);

      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.68), glowMaterial);
      glow.position.set(x, 1.32, BALL_START_Z - 1.795);
      glow.rotation.x = -0.18;
      this.scene.add(glow);
    });
  }

  private createBall(): THREE.Mesh {
    const geometry = new THREE.IcosahedronGeometry(BALL_RADIUS, 4);
    const ball = new THREE.Mesh(geometry, this.ballMaterial);
    ball.castShadow = true;
    ball.receiveShadow = true;
    this.scene.add(ball);

    const outline = new THREE.Mesh(geometry, this.outlineMaterial);
    outline.scale.setScalar(1.055);
    ball.add(outline);

    const fingerMaterial = new THREE.MeshToonMaterial({ color: "#35203a", gradientMap: this.toonGradient });
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

  private createBallReflection(): THREE.Mesh {
    const reflection = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_RADIUS, 4), this.ballReflectionMaterial);
    reflection.scale.set(1.06, 0.045, 1.06);
    reflection.renderOrder = 2;
    this.scene.add(reflection);
    return reflection;
  }

  private createCharacterBillboard(): THREE.Mesh {
    const billboard = new THREE.Mesh(new THREE.PlaneGeometry(1, CHARACTER_BILLBOARD_SETTINGS.heightMeters), this.characterBillboardMaterial);
    billboard.position.set(-0.54, 0.75, BALL_START_Z - 0.08);
    billboard.renderOrder = 4;
    this.scene.add(billboard);
    return billboard;
  }

  private updateCharacterBillboard(snapshot: MatchSnapshot): void {
    const result = snapshot.lastResult;
    const isResultPhase = snapshot.phase === "showingResult" || snapshot.phase === "matchComplete";
    const isThrowPhase = snapshot.phase === "rolling" || snapshot.phase === "settling";
    const isBeforeThrow = snapshot.phase === "aiming";
    this.updateCharacterPhaseClock(snapshot.activeBowler, snapshot.phase);

    this.characterBillboard.visible = isBeforeThrow || isThrowPhase || isResultPhase;
    if (!this.characterBillboard.visible) return;

    const throwTexture = this.characterThrowTextures[snapshot.activeBowler];
    const reactionTexture = this.characterReactionTextures[snapshot.activeBowler];

    if (isBeforeThrow) {
      const laneOffset = snapshot.activeBowler === "player" ? this.aimLaneOffset : this.throwLaneOffset;
      this.characterBillboardMaterial.map = throwTexture;
      setAtlasFrame(throwTexture, 0, CHARACTER_BILLBOARD_SETTINGS.throwAtlasColumns);
      this.placeSceneCharacterBillboard(CHARACTER_BILLBOARD_SETTINGS.beforeThrow, 0, laneOffset);
      this.updateCharacterBillboardUiOverlapOpacity();
    } else if (isThrowPhase) {
      const elapsed = performance.now() - this.throwBillboardStartedAt;
      const throwAnimation = CHARACTER_BILLBOARD_SETTINGS.throwAnimation;
      const hideAtMs = totalFrameDurationMs(throwAnimation.frameDurationsMs) + throwAnimation.hideAfterLastFrameMs;
      if (elapsed > hideAtMs) {
        this.characterBillboard.visible = false;
        return;
      }
      const frame = timedAtlasFrame(elapsed, throwAnimation.frameDurationsMs);
      this.characterBillboardMaterial.map = throwTexture;
      this.characterBillboardMaterial.opacity = 1;
      setAtlasFrame(throwTexture, frame, CHARACTER_BILLBOARD_SETTINGS.throwAtlasColumns);
      this.placeCameraCharacterBillboard(CHARACTER_BILLBOARD_SETTINGS.throwing, 0);
    } else {
      const reactionFrame = reactionFrameForResult(result);
      const bounce = reactionFrame === 0
        ? Math.abs(Math.sin(performance.now() / CHARACTER_BILLBOARD_SETTINGS.happyBounceMs)) * CHARACTER_BILLBOARD_SETTINGS.happyBounceMeters
        : 0;
      this.characterBillboardMaterial.map = reactionTexture;
      this.characterBillboardMaterial.opacity = 1;
      setAtlasFrame(reactionTexture, reactionFrame, CHARACTER_BILLBOARD_SETTINGS.reactionAtlasColumns);
      this.placeSceneCharacterBillboard(CHARACTER_BILLBOARD_SETTINGS.afterThrow, bounce, this.throwLaneOffset);
    }

    this.characterBillboardMaterial.needsUpdate = true;
  }

  private updateCharacterPhaseClock(activeBowler: BowlerId, phase: MatchPhase): void {
    const stateKey = `${activeBowler}:${phase}`;
    if (stateKey === this.lastCharacterStateKey) return;
    this.lastCharacterStateKey = stateKey;
    if (phase === "rolling") {
      if (this.throwBillboardStartedAt <= 0) {
        this.throwBillboardStartedAt = performance.now();
      }
    } else if (phase === "aiming" || phase === "showingResult" || phase === "matchComplete") {
      this.throwBillboardStartedAt = 0;
    }
  }

  private placeSceneCharacterBillboard(placement: CharacterScenePlacement, extraY: number, laneOffset: number): void {
    this.characterBillboard.position.set(
      laneOffset + placement.laneOffset,
      placement.y + extraY,
      BALL_START_Z + placement.zFromBallStart,
    );
    this.characterBillboard.scale.set(placement.scale, placement.scale, 1);
    this.characterBillboard.lookAt(this.camera.position.x, this.characterBillboard.position.y, this.camera.position.z);
  }

  private placeCameraCharacterBillboard(placement: CharacterCameraPlacement, extraY: number): void {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();
    this.characterBillboard.position
      .copy(this.camera.position)
      .add(forward.multiplyScalar(placement.forward))
      .add(right.multiplyScalar(placement.right))
      .add(up.multiplyScalar(placement.up + extraY));
    this.characterBillboard.scale.set(placement.scale, placement.scale, 1);
    this.characterBillboard.quaternion.copy(this.camera.quaternion);
  }

  private updateCharacterBillboardUiOverlapOpacity(): void {
    const billboardRect = this.projectCharacterBillboardScreenRect();
    const overlapsUi = billboardRect ? visibleHudRects().some((hudRect) => rectsOverlap(billboardRect, hudRect)) : false;
    this.characterBillboardMaterial.opacity = overlapsUi ? CHARACTER_BILLBOARD_SETTINGS.uiOverlapOpacity : 1;
  }

  private projectCharacterBillboardScreenRect(): DOMRect | undefined {
    this.characterBillboard.updateWorldMatrix(true, false);
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return undefined;

    const geometry = this.characterBillboard.geometry as THREE.PlaneGeometry;
    const parameters = geometry.parameters;
    const halfWidth = parameters.width / 2;
    const halfHeight = parameters.height / 2;
    const corners = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0),
      new THREE.Vector3(-halfWidth, halfHeight, 0),
    ].map((corner) => {
      const projected = corner.applyMatrix4(this.characterBillboard.matrixWorld).project(this.camera);
      return {
        x: canvasRect.left + ((projected.x + 1) / 2) * canvasRect.width,
        y: canvasRect.top + ((1 - projected.y) / 2) * canvasRect.height,
      };
    });
    const left = Math.min(...corners.map((corner) => corner.x));
    const right = Math.max(...corners.map((corner) => corner.x));
    const top = Math.min(...corners.map((corner) => corner.y));
    const bottom = Math.max(...corners.map((corner) => corner.y));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private createAtlasTexture(url: string, columns: number): THREE.Texture {
    const texture = this.textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.repeat.set(1 / columns, 1);
    texture.offset.set(0, 0);
    return texture;
  }

  private updateBallMaterial(activeBowler: BowlerId): void {
    const color = activeBowler === "rival" ? "#3db7ff" : "#ff79ad";
    this.ballMaterial.color.lerp(new THREE.Color(color), 0.18);
    this.ballMaterial.emissive.set(activeBowler === "rival" ? "#061a35" : "#260817");
    this.ballMaterial.emissiveIntensity = activeBowler === "rival" ? 0.22 : 0.12;
    this.ballReflectionMaterial.color.lerp(new THREE.Color(activeBowler === "rival" ? "#7ad7ff" : "#ff9bc4"), 0.18);
  }

  private createPinMesh(id: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `pin-${id}`;

    const bodyMaterial = new THREE.MeshToonMaterial({ color: "#fff8ef", gradientMap: this.toonGradient });
    const stripeMaterial = new THREE.MeshToonMaterial({ color: "#ff517c", gradientMap: this.toonGradient });

    const h = BOWLING_DIMENSIONS.pinHeight;
    const profile = [
      [PIN_BASE_RADIUS * 0.72, -h * 0.5],
      [PIN_BASE_RADIUS, -h * 0.475],
      [PIN_BASE_RADIUS * 1.12, -h * 0.43],
      [PIN_MAX_RADIUS * 0.64, -h * 0.34],
      [PIN_MAX_RADIUS * 0.92, -h * 0.18],
      [PIN_MAX_RADIUS, -h * 0.04],
      [PIN_MAX_RADIUS * 0.86, h * 0.08],
      [PIN_MAX_RADIUS * 0.48, h * 0.19],
      [PIN_MAX_RADIUS * 0.36, h * 0.3],
      [PIN_MAX_RADIUS * 0.5, h * 0.39],
      [PIN_MAX_RADIUS * 0.56, h * 0.445],
      [PIN_MAX_RADIUS * 0.34, h * 0.5],
    ].map(([radius, y]) => new THREE.Vector2(radius, y));

    const bodyGeometry = new THREE.LatheGeometry(profile, 28);
    bodyGeometry.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const outline = new THREE.Mesh(bodyGeometry, this.outlineMaterial);
    outline.scale.set(1.055, 1.018, 1.055);

    const upperStripe = new THREE.Mesh(new THREE.TorusGeometry(PIN_MAX_RADIUS * 0.42, h * 0.014, 8, 28), stripeMaterial);
    upperStripe.rotation.x = Math.PI / 2;
    upperStripe.position.y = h * 0.245;
    const lowerStripe = new THREE.Mesh(new THREE.TorusGeometry(PIN_MAX_RADIUS * 0.46, h * 0.014, 8, 28), stripeMaterial);
    lowerStripe.rotation.x = Math.PI / 2;
    lowerStripe.position.y = h * 0.19;

    [body, outline, upperStripe, lowerStripe].forEach((mesh) => {
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

function createToonGradientTexture(): THREE.DataTexture {
  const ramp = new Uint8Array([
    58, 58, 78, 255,
    132, 126, 154, 255,
    214, 205, 226, 255,
    255, 252, 242, 255,
  ]);
  const texture = new THREE.DataTexture(ramp, 4, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function setAtlasFrame(texture: THREE.Texture, frame: number, columns: number): void {
  texture.repeat.set(1 / columns, 1);
  texture.offset.set(frame / columns, 0);
  texture.needsUpdate = true;
}

function timedAtlasFrame(elapsedMs: number, frameDurationsMs: readonly number[]): number {
  let elapsedBeforeFrame = 0;
  for (let frame = 0; frame < frameDurationsMs.length; frame += 1) {
    elapsedBeforeFrame += frameDurationsMs[frame];
    if (elapsedMs < elapsedBeforeFrame) return frame;
  }
  return frameDurationsMs.length - 1;
}

function totalFrameDurationMs(frameDurationsMs: readonly number[]): number {
  return frameDurationsMs.reduce((total, duration) => total + duration, 0);
}

function visibleHudRects(): DOMRect[] {
  const selectors = [".score-panel", ".control-panel", ".turn-chip", ".performance-window", ".character-card"];
  return selectors.flatMap((selector) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.02;
      })
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0),
  );
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function reactionFrameForResult(result: ThrowResult | undefined): number {
  if (!result) return 3;
  if (result.isStrike || result.isSpare) return 0;
  if (result.knockedPins === 0) return 1;
  if (isSplitLikeStandingPins(result.standingPins)) return 2;
  return 3;
}

function isSplitLikeStandingPins(standingPins: number[]): boolean {
  if (standingPins.length < 2 || standingPins.includes(1)) return false;

  const leftPins = new Set([2, 4, 7, 8]);
  const rightPins = new Set([3, 6, 9, 10]);
  const hasLeft = standingPins.some((pin) => leftPins.has(pin));
  const hasRight = standingPins.some((pin) => rightPins.has(pin));
  const hasCenterBridge = standingPins.some((pin) => pin === 5);
  return hasLeft && hasRight && !hasCenterBridge;
}
