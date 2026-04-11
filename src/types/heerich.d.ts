declare module 'heerich' {
  type FaceKey = 'default' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

  interface FaceStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    opacity?: number | string;
    strokeDasharray?: string;
    strokeLinecap?: string;
    strokeLinejoin?: string;
    fillOpacity?: number | string;
    strokeOpacity?: number | string;
  }

  type StyleValue = FaceStyle | ((x: number, y: number, z: number) => FaceStyle);
  type StyleSpec = Partial<Record<FaceKey, StyleValue>>;

  type ScaleValue = [number, number, number] | ((x: number, y: number, z: number) => [number, number, number] | null);

  interface GeometryBase {
    mode?: 'union' | 'subtract' | 'intersect' | 'exclude';
    style?: StyleSpec | ((x: number, y: number, z: number) => StyleSpec);
    opaque?: boolean;
    meta?: Record<string, string | number>;
    scale?: ScaleValue;
    scaleOrigin?: [number, number, number] | ((x: number, y: number, z: number) => [number, number, number]);
    rotate?: { axis: 'x' | 'y' | 'z'; turns: number; center?: [number, number, number] };
    content?: string;
  }

  interface BoxGeometry extends GeometryBase {
    type: 'box';
    position?: [number, number, number];
    size?: number | [number, number, number];
    center?: [number, number, number];
  }

  interface SphereGeometry extends GeometryBase {
    type: 'sphere';
    center: [number, number, number];
    radius: number;
  }

  interface LineGeometry extends GeometryBase {
    type: 'line';
    from: [number, number, number];
    to: [number, number, number];
    radius?: number;
    shape?: 'rounded' | 'square';
  }

  interface FillGeometry extends GeometryBase {
    type: 'fill';
    bounds: [[number, number, number], [number, number, number]];
    test: (x: number, y: number, z: number) => boolean;
  }

  type Geometry = BoxGeometry | SphereGeometry | LineGeometry | FillGeometry;

  interface ObliqueCamera {
    type: 'oblique';
    angle?: number;
    distance?: number;
  }

  interface PerspectiveCamera {
    type: 'perspective';
    position?: [number, number];
    distance?: number;
  }

  interface HeerichOptions {
    tile?: number | [number, number] | [number, number, number];
    camera?: ObliqueCamera | PerspectiveCamera;
    style?: FaceStyle;
  }

  interface SVGOptions {
    padding?: number;
    viewBox?: [number, number, number, number];
    offset?: [number, number];
    prepend?: string;
    append?: string;
  }

  interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  export class Heerich {
    constructor(options?: HeerichOptions);
    applyGeometry(geometry: Geometry): void;
    removeGeometry(geometry: Geometry): void;
    addGeometry(geometry: Geometry): void;
    applyStyle(options: { style: StyleSpec; type?: string; [key: string]: unknown }): void;
    setCamera(camera: ObliqueCamera | PerspectiveCamera): void;
    rotate(options: { axis: 'x' | 'y' | 'z'; turns: number; center?: [number, number, number] }): void;
    clear(): void;
    toSVG(options?: SVGOptions): string;
    getBounds(padding?: number): Bounds;
    hasVoxel(pos: [number, number, number]): boolean;
    getVoxel(pos: [number, number, number]): unknown;
    getNeighbors(pos: [number, number, number]): Record<string, unknown>;
    batch(fn: () => void): void;
    toJSON(): unknown;
    static fromJSON(json: unknown): Heerich;
    [Symbol.iterator](): Iterator<unknown>;
  }
}
