export const SETTINGS = {
  race: {
    laps: 3,
    rivals: 3,
    countdown: 3.2
  },
  track: {
    width: 15,
    barrierOffset: 9.5,
    barrierHeight: 1.05
  },
  physics: {
    chassisMassDensity: 240,
    suspensionStiffness: 38,
    suspensionCompression: 3.4,
    suspensionRelaxation: 3.0,
    maxSuspensionTravel: 0.26,
    suspensionRest: 0.235,
    frictionSlipFront: 2.65,
    frictionSlipRear: 2.45,
    sideFrictionStiffness: 1.15,
    maxEngineForce: 7400,
    maxBrakeForce: 62,
    handbrakeForce: 90,
    frontDriveShare: 0.22,
    topSpeed: 92
  },
  camera: {
    // Cámara de persecución cercana: carrocería visible incluso a alta velocidad.
    fov: 59,
    fovMax: 66,
    height: 1.85,
    distance: 4.8,
    lookAhead: 4.8
  },
  render: {
    // The adaptive scaler owns sharpness; capping DPR at 1 keeps a 1080p
    // window at a true 1920x1080 buffer instead of 2x supersampling.
    maxPixelRatio: 2.0,  // 4K support: allow 2x supersampling on capable displays
    shadowMapSize: 4096,  // 4K shadows
    targetWidth: 3840,    // 4K width
    targetHeight: 2160    // 4K height
  }
} as const;
