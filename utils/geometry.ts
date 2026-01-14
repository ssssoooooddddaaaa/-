import { Point, ElementType, Theme } from '../types';

// Element Themes
export const THEMES: Record<ElementType, Theme> = {
  NEUTRAL: { primary: '#FFA014', secondary: '#FFC832', core: '#FFFFFF', shadow: '#FFA014', background: '#121212' }, // Dark Grey
  FIRE: { primary: '#FF4500', secondary: '#FF8C00', core: '#FFFF00', shadow: '#FF0000', background: '#220a05' }, // Deep Red/Brown
  WATER: { primary: '#1E90FF', secondary: '#00BFFF', core: '#E0FFFF', shadow: '#0000FF', background: '#051022' }, // Deep Navy
  THUNDER: { primary: '#9400D3', secondary: '#FF00FF', core: '#FFFFE0', shadow: '#4B0082', background: '#150522' }, // Deep Purple
  WIND: { primary: '#00FA9A', secondary: '#98FB98', core: '#F0FFF0', shadow: '#006400', background: '#051812' }, // Deep Green
};

// Layer 1: Runes Ring
export const drawRuneRing = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  theme: Theme
) => {
  const segments = 24;
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 2;
  
  // Outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner border for runes
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.85, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  for (let i = 0; i < segments; i++) {
    const angle = (Math.PI * 2) / segments;
    ctx.save();
    ctx.rotate(i * angle);
    ctx.translate(radius * 0.925, 0); 

    // Procedural Rune Glyph
    const seed = i * 13.37;
    const size = radius * 0.05;

    ctx.beginPath();
    ctx.moveTo(-size, -size + Math.sin(seed) * size);
    ctx.lineTo(size, size - Math.cos(seed) * size);
    ctx.moveTo(-size, size);
    ctx.lineTo(size + Math.sin(seed * 2) * 5, -size);
    if (i % 3 === 0) ctx.rect(-size / 2, -size / 2, size, size);
    
    ctx.strokeStyle = theme.secondary;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
  ctx.restore();
};

// Layer 2: Sacred Geometry (Hexagram/Triangle)
export const drawSacredGeometry = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  theme: Theme
) => {
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Triangle 1
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const theta = (i * 2 * Math.PI) / 3;
    const px = radius * Math.cos(theta);
    const py = radius * Math.sin(theta);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Triangle 2 (Inverted)
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const theta = (i * 2 * Math.PI) / 3 + Math.PI; 
    const px = radius * Math.cos(theta);
    const py = radius * Math.sin(theta);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Inner Circle
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = theme.secondary;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
};

// Layer 3: Rotating Square (Diamond)
export const drawSquareLayer = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  theme: Theme
) => {
  ctx.strokeStyle = theme.secondary;
  ctx.lineWidth = 4;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  
  ctx.beginPath();
  const size = radius;
  ctx.rect(-size / 2, -size / 2, size, size);
  ctx.stroke();

  // Decorative corners
  ctx.fillStyle = theme.core;
  const cornerSize = 4;
  ctx.fillRect(-size / 2 - cornerSize, -size / 2 - cornerSize, cornerSize * 2, cornerSize * 2);
  ctx.fillRect(size / 2 - cornerSize, -size / 2 - cornerSize, cornerSize * 2, cornerSize * 2);
  ctx.fillRect(size / 2 - cornerSize, size / 2 - cornerSize, cornerSize * 2, cornerSize * 2);
  ctx.fillRect(-size / 2 - cornerSize, size / 2 - cornerSize, cornerSize * 2, cornerSize * 2);

  ctx.restore();
};

// Layer 4: Pulsing Pentagram
export const drawPentagram = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  pulse: number,
  theme: Theme
) => {
  const r = radius * (0.8 + pulse * 0.2); 
  ctx.strokeStyle = theme.core;
  ctx.lineWidth = 2 + pulse * 2;
  ctx.shadowBlur = 10 + pulse * 10;
  ctx.shadowColor = theme.shadow;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const theta = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const px = r * Math.cos(theta);
    const py = r * Math.sin(theta);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  
  ctx.shadowBlur = 0; 
  ctx.restore();
};