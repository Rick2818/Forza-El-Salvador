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
    // Keep the rear tires in frame while retaining a close view of the car.
    fov: 55,
    fovMax: 59,
    height: 1.15,
    distance: 4.8,
    lateralOffset: 1.9,
    lookAhead: 0.9
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
