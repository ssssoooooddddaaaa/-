export type ElementType = 'NEUTRAL' | 'FIRE' | 'WATER' | 'THUNDER' | 'WIND';
export type ComboType = 'BLIZZARD' | 'PLASMA' | 'STEAM' | 'TEMPEST' | 'INFERNO' | 'VOID';
export type ParticleType = 'ORB' | 'LEAF' | 'SPARK' | 'DROP' | 'MIST' | 'EMBER';

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  element: ElementType | ComboType;
  type: ParticleType;
  angle: number;           // For rotation (leaves)
  angularVelocity: number; // For rotation speed
}

export interface Monster {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  element: ElementType;
  radius: number;
  scoreValue: number;
  pulseOffset: number;
  isBoss: boolean; // New property to identify boss units
}

export interface HandData {
  wrist: Point;
  indexTip: Point;
  middleTip: Point;
  ringTip: Point;
  pinkyTip: Point;
  thumbTip: Point;
  indexBase: Point; 
  middleBase: Point;
  ringBase: Point;
  pinkyBase: Point;
  isOpen: boolean;
  gesture: ElementType;
  opacity: number;
}

export interface Theme {
  primary: string;
  secondary: string;
  core: string;
  shadow: string;
  background: string; 
}