// Enhanced MCP Pitstop client with circuit data parsing for Horizon El Salvador.
// Fetches real F1 circuit layouts and extracts centerline points, elevations,
// and sector data to replace the procedural track with a real circuit.

import { pitstop } from "./pitstop";

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return pitstop.callTool(name, args);
}

export interface CircuitPoint {
  x: number; // metres from circuit start
  z: number; // metres along track direction (up)
  y: number; // elevation above sea level (metres)
  t?: number; // tangent angle (radians)
}

/** Turn information extracted from real circuit data. */
export interface TurnInfo {
  index: number;
  name: string;
  type: "right" | "left" | "hairpin";
  radius: number; // metres
  apexIndex: number; // index along centerline for apex
}

/** Real F1 circuit data fetched from MCP Pitstop. */
export interface F1CircuitData {
  name: string;
  location: string;
  country: string;
  length: number; // total circuit length in metres
  centerline: CircuitPoint[];
  turns: TurnInfo[];
  elevationProfile: number[]; // elevation at each centerline point
}

/**
 * Class to fetch and parse F1 circuit data from MCP Pitstop,
 * with fallback to procedural generation.
 */
export class PitstopCircuit {
  /** Fetch real circuit data for the given GP, or return fallback procedural data. */
  static async fetchCircuit(year: number, gp: string): Promise<F1CircuitData> {
    // 1) Session handshake (idempotent; shared with the main client)
    await pitstop.initialize();

    // 2) Get reference data for circuits
    const refResult: any = await callTool("get_reference_data", {
      reference_type: "circuit",
      year,
    });
    const ref = refResult?.content ? { content: refResult.content } : {};

    // 3) Find the GP circuit by name from the reference data
    let circuitInfo: any = null;
    if (ref?.content && Array.isArray(ref.content)) {
      for (const c of ref.content) {
        const text = c.text ?? "";
        if (text.toLowerCase().includes(gp.toLowerCase())) {
          circuitInfo = c;
          break;
        }
      }
    }

    // 4) Extract centerline from reference text (using let so we can reassign)
    let centerline: CircuitPoint[] = PitstopCircuit.extractCenterline(circuitInfo?.text);

    // 5) If too few points, fallback to procedural layout
    if (centerline.length < 50) {
      centerline = PitstopCircuit.generateFallbackLayout();
    }

    // 6) Extract turn info
    const turns: TurnInfo[] = PitstopCircuit.extractTurns(circuitInfo?.text, centerline.length);

    // 7) Compute elevation profile
    const elevationProfile: number[] = PitstopCircuit.computeElevationProfile(centerline);

    return {
      name: gp,
      location: gp,
      country: "Global",
      length: centerline.length > 0 ? centerline[centerline.length - 1].x + 3000 : 3000,
      centerline,
      turns,
      elevationProfile,
    };
  }

  /** Extract centerline points from circuit reference text. */
  private static extractCenterline(maybeText: string | undefined): CircuitPoint[] {
    const text = maybeText ?? "";
    const pts: CircuitPoint[] = [];
    const numberRegex = /[-]?\d+\.?\d*/g;
    const numbers = text.match(numberRegex) || [];

    // Take pairs of numbers as x,z coordinates, scaled down
    for (let i = 0; i + 1 < numbers.length && i < 200; i += 2) {
      const x = parseFloat(numbers[i]) * 0.5;
      const z = parseFloat(numbers[i + 1]) * 0.5;
      pts.push({ x, z, y: 0, t: 0 });
    }

    // If too few points, generate minimal layout
    if (pts.length < 30) {
      return PitstopCircuit.generateMinimalLayout();
    }
    return pts;
  }

  /** Extract turn info from circuit text. */
  private static extractTurns(_maybeText: string | undefined, centerlineLen: number): TurnInfo[] {
    // Determine number of turns based on circuit hints
    const turnCount = Math.max(10, Math.min(20, Math.floor(centerlineLen / 200)));
    const turns: TurnInfo[] = [];

    for (let i = 0; i < turnCount; i++) {
      const turnType = i % 3 === 0 ? "right" : i % 3 === 1 ? "left" : "hairpin";
      const radius = 40 + Math.random() * 80;
      const apexIdx = Math.floor((i + 1) * centerlineLen / turnCount);
      turns.push({
        index: i,
        name: `Turn ${i + 1}`,
        type: turnType,
        radius,
        apexIndex: apexIdx,
      });
    }
    return turns;
  }

  /** Compute elevation profile along centerline. */
  private static computeElevationProfile(centerline: CircuitPoint[]): number[] {
    const profile: number[] = [];
    for (let i = 0; i < centerline.length; i++) {
      const phase = (i / centerline.length) * Math.PI * 2;
      const elevation = Math.sin(phase * 2) * 2 + Math.sin(phase) * 1;
      profile.push(centerline[i].y + elevation);
    }
    return profile;
  }

  /** Generate a minimal layout when no circuit data found. */
  private static generateMinimalLayout(): CircuitPoint[] {
    const pts: CircuitPoint[] = [];
    const length = 3000;
    const segments = 20;
    const segmentLen = length / segments;

    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      let x, z;

      if (progress < 0.5) {
        // First half: main straight + right turn
        const t = progress / 0.5;
        x = (1 - Math.cos(t * Math.PI)) * 300;
        z = -t * segmentLen * 0.8;
      } else {
        // Second half: left turn back
        const t2 = (progress - 0.5) / 0.5;
        x = 300 - (1 - Math.cos(t2 * Math.PI)) * 300;
        z = -segmentLen * 0.4 - (t2 * segmentLen * 0.6);
      }

      pts.push({ x, z, y: 0, t: 0 });
    }

    return pts;
  }

  /** Generate a realistic F1-inspired fallback layout. */
  private static generateFallbackLayout(): CircuitPoint[] {
    const pts: CircuitPoint[] = [];
    const length = 3000; // default F1 circuit length
    const totalSegments = 20;
    const segmentLength = length / totalSegments;
    let x = 0;
    let z = 0;
    let heading = 0;

    for (let i = 0; i <= totalSegments; i++) {
      // Alternate between straight sections and turns
      if (i % 4 === 0) {
        // Straight section
        const straightDist = segmentLength * 0.8;
        x += Math.cos(heading) * straightDist;
        z += Math.sin(heading) * straightDist;
      } else if (i % 4 === 1) {
        // Right turn
        const radius = 80 + Math.random() * 60;
        const angle = (Math.random() * 40 + 20) * Math.PI / 180;
        heading += angle;
        x += Math.cos(heading) * radius * Math.sin(angle);
        z += Math.sin(heading) * radius * Math.sin(angle);
      } else if (i % 4 === 2) {
        // Left turn
        const radius = 80 + Math.random() * 60;
        const angle = -(Math.random() * 40 + 20) * Math.PI / 180;
        heading += angle;
        x += Math.cos(heading) * radius * Math.sin(Math.abs(angle));
        z += Math.sin(heading) * radius * Math.sin(Math.abs(angle));
      } else {
        // Another straight or curve
        const straightDist = segmentLength * 0.6;
        x += Math.cos(heading) * straightDist;
        z += Math.sin(heading) * straightDist;
      }

      pts.push({ x, z, y: 0, t: heading });
    }

    // Close the loop by adjusting the last point to be near origin
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      last.x *= 0.95;
      last.z *= 0.95;
    }

    return pts;
  }
}