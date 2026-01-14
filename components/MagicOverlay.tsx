import React, { useEffect, useRef, useCallback, useState } from 'react';
import Webcam from 'react-webcam';
import { GoogleGenAI } from "@google/genai";
import { Particle, HandData, ElementType, Theme, ParticleType, Monster } from '../types';
import { 
  drawRuneRing, 
  drawSacredGeometry, 
  drawSquareLayer, 
  drawPentagram,
  THEMES
} from '../utils/geometry';

interface MagicOverlayProps {
  width: number;
  height: number;
}

type Difficulty = 'NORMAL' | 'HARD';

// Damage Number Interface
interface DamageNumber {
  x: number;
  y: number;
  value: number;
  type: 'NORMAL' | 'CRIT' | 'WEAKNESS';
  life: number;
  vx: number;
  vy: number;
}

const COMBO_THEMES: Record<string, Theme> = {
  'BLIZZARD': { primary: '#00FFFF', secondary: '#E0FFFF', core: '#FFFFFF', shadow: '#008B8B', background: '#0a1a20' }, 
  'PLASMA': { primary: '#FF00FF', secondary: '#00FFFF', core: '#FFFFFF', shadow: '#9400D3', background: '#1a051a' }, 
  'STEAM': { primary: '#F0F8FF', secondary: '#B0C4DE', core: '#FFFFFF', shadow: '#778899', background: '#10151a' }, 
  'TEMPEST': { primary: '#000080', secondary: '#8A2BE2', core: '#FFFF00', shadow: '#191970', background: '#05051a' }, 
  'INFERNO': { primary: '#FF0000', secondary: '#FF4500', core: '#FFFF00', shadow: '#8B0000', background: '#2a0500' }, 
  'VOID': { primary: '#000000', secondary: '#4B0082', core: '#FFFFFF', shadow: '#9400D3', background: '#000000' }, 
};

const ELEMENT_NAMES_CN: Record<string, string> = {
    'NEUTRAL': '等待施法...',
    'FIRE': '🔥 烈焰术 (FIRE)',
    'WATER': '💧 唤雨术 (WATER)',
    'THUNDER': '⚡ 雷霆术 (THUNDER)',
    'WIND': '🌪️ 疾风术 (WIND)',
    'BLIZZARD': '❄️ 极寒风暴 (BLIZZARD)',
    'PLASMA': '⚛️ 等离子破 (PLASMA)',
    'STEAM': '♨️ 灼热蒸汽 (STEAM)',
    'TEMPEST': '⛈️ 雷暴风眼 (TEMPEST)',
    'INFERNO': '🌋 地狱烈火 (INFERNO)',
    'VOID': '🌌 虚空奇点 (VOID)'
};

const getCombo = (g1: ElementType, g2: ElementType): string | null => {
    const sorted = [g1, g2].sort().join('_');
    switch(sorted) {
        case 'WATER_WIND': return 'BLIZZARD';
        case 'FIRE_WIND': return 'PLASMA';
        case 'FIRE_WATER': return 'STEAM';
        case 'THUNDER_WATER': return 'TEMPEST';
        case 'FIRE_FIRE': return 'INFERNO';
        case 'THUNDER_THUNDER': return 'VOID';
        default: return null;
    }
};

const MagicOverlay: React.FC<MagicOverlayProps> = ({ width, height }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Webcam Preview Ref
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(true);

  // Game Refs
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]); // Ref for damage numbers
  const handDataRef = useRef<HandData[]>([]);
  const monstersRef = useRef<Monster[]>([]);
  const monsterSpawnTimerRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const coreHealthRef = useRef<number>(100);
  const lastHandUpdateRef = useRef<number>(0);
  
  // Level System Refs
  const levelRef = useRef<number>(1);
  const levelProgressRef = useRef<number>(0);
  const isBossActiveRef = useRef<boolean>(false);
  const maxLevel = 10; // Capped at 10 levels

  // Cooldowns
  const cooldownsRef = useRef<Record<string, number>>({});
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const comboStartTimeRef = useRef<number>(0);

  // App State
  const [currentElement, setCurrentElement] = useState<string>('NEUTRAL');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("初始化系统...");
  const [hasStarted, setHasStarted] = useState(false);
  const [showControls, setShowControls] = useState(false); 
  const [isCameraReady, setCameraReady] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [showRules, setShowRules] = useState(true); 
  
  // AI Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState<string>("");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Game UI State
  const [uiScore, setUiScore] = useState(0);
  const [uiHealth, setUiHealth] = useState(100);
  const [uiLevel, setUiLevel] = useState(1);
  const [uiProgress, setUiProgress] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [nowTime, setNowTime] = useState(Date.now()); 

  // Settings State 
  const [settings, setSettings] = useState({
      speed: 1.0,   
      count: 0.5,   
      glow: 1.0,    
  });
  
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Visual Feedback State
  const highlightRef = useRef<number>(0);
  const prevElementRef = useRef<string>('NEUTRAL');
  const activeComboRef = useRef<string | null>(null);
  
  // Audio Context
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);

  const currentTheme = activeComboRef.current && COMBO_THEMES[activeComboRef.current]
    ? COMBO_THEMES[activeComboRef.current] 
    : (THEMES[currentElement as ElementType] || THEMES['NEUTRAL']);

  useEffect(() => {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const bufferSize = ctx.sampleRate * 2; 
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noiseBufferRef.current = buffer;
    }
    
    const timer = setInterval(() => {
        setNowTime(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const startExperience = () => {
      setHasStarted(true);
      if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
      }
      monstersRef.current = [];
      particlesRef.current = [];
      damageNumbersRef.current = [];
      scoreRef.current = 0;
      coreHealthRef.current = 100;
      levelRef.current = 1;
      levelProgressRef.current = 0;
      isBossActiveRef.current = false;
      cooldownsRef.current = {};
      setCooldowns({});
      lastHandUpdateRef.current = Date.now();
      
      setUiScore(0);
      setUiHealth(100);
      setUiLevel(1);
      setUiProgress(0);
      setIsGameOver(false);
      setIsVictory(false);
  };

  const handleSnapshot = () => {
      if (canvasRef.current) {
          const dataUrl = canvasRef.current.toDataURL('image/png');
          setCapturedImage(dataUrl);
          setGeneratedImage(null);
          setEditPrompt("Turn the magic effects into realistic fire and lightning");
          setIsEditing(true);
      }
  };

  const handleGenerate = async () => {
      if (!capturedImage || !process.env.API_KEY) return;
      setIsGenerating(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const base64Data = capturedImage.split(',')[1];
          
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/png', data: base64Data } },
                    { text: editPrompt }
                ]
            }
          });
          
          // Look for image in response
          const candidates = response.candidates;
          if (candidates && candidates.length > 0) {
             for (const part of candidates[0].content.parts) {
                 if (part.inlineData) {
                     setGeneratedImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                     break;
                 }
             }
          }
      } catch (e) {
          console.error("Gemini Generation Error:", e);
          setEditPrompt("Generation failed. Please try again.");
      } finally {
          setIsGenerating(false);
      }
  };

  const playChime = useCallback((element: string) => {
    const ctx = audioContextRef.current;
    if (!ctx || !noiseBufferRef.current) return;
    if (ctx.state === 'suspended') ctx.resume().catch(console.error);

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.setValueAtTime(0.3, now); 

    const playNoise = (filterType: BiquadFilterType, freqStart: number, freqEnd: number, duration: number, vol: number = 1, delay: number = 0) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBufferRef.current;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(freqStart, now + delay);
        filter.frequency.exponentialRampToValueAtTime(freqEnd, now + delay + duration);
        filter.Q.value = 1;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0, now + delay);
        amp.gain.linearRampToValueAtTime(vol, now + delay + 0.05);
        amp.gain.exponentialRampToValueAtTime(0.01, now + delay + duration);
        src.connect(filter);
        filter.connect(amp);
        amp.connect(masterGain);
        src.start(now + delay);
        src.stop(now + delay + duration + 0.2);
    };

    const playTone = (type: OscillatorType, freqStart: number, freqEnd: number, duration: number, vol: number = 1, delay: number = 0) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now + delay);
        if (freqStart !== freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + delay + duration);
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0, now + delay);
        amp.gain.linearRampToValueAtTime(vol, now + delay + 0.05);
        amp.gain.exponentialRampToValueAtTime(0.01, now + delay + duration);
        osc.connect(amp);
        amp.connect(masterGain);
        osc.start(now + delay);
        osc.stop(now + delay + duration + 0.2);
    };

    switch (element) {
        case 'FIRE': playNoise('lowpass', 500, 100, 1.0, 0.5); playTone('sawtooth', 80, 120, 0.8, 0.2); break;
        case 'WATER': playNoise('bandpass', 800, 300, 0.6, 0.4); playTone('sine', 600, 300, 0.4, 0.3, 0.1); break;
        case 'WIND': playNoise('lowpass', 200, 800, 0.4, 0.3); playNoise('highpass', 400, 1000, 0.5, 0.2, 0.1); break;
        case 'THUNDER': playTone('sawtooth', 800, 50, 0.3, 0.2); playNoise('lowpass', 1000, 50, 1.2, 0.6, 0.1); break;
        case 'BLIZZARD': playNoise('highpass', 1000, 3000, 1.5, 0.4); playTone('sine', 1500, 2000, 0.3, 0.1, 0.1); break;
        case 'INFERNO': playNoise('lowpass', 800, 50, 1.5, 0.8); playTone('square', 60, 40, 1.5, 0.2); break;
        case 'TEMPEST': playNoise('lowpass', 200, 50, 2.0, 0.8); playTone('sawtooth', 1200, 100, 0.5, 0.2, 0.1); playNoise('bandpass', 1000, 500, 1.0, 0.3); break;
        case 'VOID': playTone('sine', 50, 40, 2.5, 0.6); playNoise('bandpass', 100, 200, 2.5, 0.4); playTone('sine', 300, 290, 1.0, 0.1, 0.5); break;
        case 'PLASMA': playTone('sawtooth', 200, 800, 1.0, 0.2); playNoise('bandpass', 400, 1200, 1.0, 0.4); break;
        case 'STEAM': playNoise('highpass', 500, 1000, 1.0, 0.3); break;
        default: playTone('triangle', 440, 880, 0.3, 0.1);
    }
  }, []);

  const detectGesture = (landmarks: any[], videoWidth: number, videoHeight: number): ElementType => {
    if (!landmarks || landmarks.length < 21) return 'NEUTRAL';
    
    const mapPt = (idx: number) => ({ x: (1 - landmarks[idx].x) * videoWidth, y: landmarks[idx].y * videoHeight });
    const wrist = mapPt(0);
    const indexTip = mapPt(8);
    const middleTip = mapPt(12);
    const middleMCP = mapPt(9);
    
    const distSq = (p1: any, p2: any) => (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
    // Relaxed threshold: 0.8 allows for better detection when fingers are curved or foreshortened
    const isFingerOpen = (tip: any, mcp: any) => distSq(tip, wrist) > distSq(mcp, wrist) * 0.8;

    const isPointingDown = wrist.y < middleMCP.y; // wrist higher than mcp (y is 0 at top)
    if (isPointingDown) return 'WATER';

    let openCount = 0;
    if (isFingerOpen(indexTip, mapPt(5))) openCount++;
    if (isFingerOpen(middleTip, mapPt(9))) openCount++;
    if (isFingerOpen(mapPt(16), mapPt(13))) openCount++;
    if (isFingerOpen(mapPt(20), mapPt(17))) openCount++;

    if (openCount >= 4) return 'FIRE';
    if (openCount >= 2) return 'WIND';
    return 'THUNDER';
  };

  const drawSkeleton = (ctx: CanvasRenderingContext2D, hand: HandData) => {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      const points = [hand.wrist, hand.indexBase, hand.indexTip, hand.middleBase, hand.middleTip, hand.ringBase, hand.ringTip, hand.pinkyBase, hand.pinkyTip, hand.thumbTip];
      
      const drawLine = (p1: any, p2: any) => { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
      drawLine(hand.wrist, hand.indexBase); drawLine(hand.indexBase, hand.indexTip);
      drawLine(hand.wrist, hand.middleBase); drawLine(hand.middleBase, hand.middleTip);
      drawLine(hand.wrist, hand.pinkyBase); drawLine(hand.pinkyBase, hand.pinkyTip);

      points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); });
  };

  const onResults = useCallback((results: any) => {
    try {
        lastHandUpdateRef.current = Date.now();
        const displayWidth = width;
        const displayHeight = height;

        setIsModelLoaded((prev) => {
            if (!prev) return true;
            return prev;
        });

        // Debug info update
        const handCount = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
        if (Math.random() < 0.05) { // Throttle debug updates
            setDebugInfo(`System Running - Hands Detected: ${handCount}`);
        }

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const newHandData: HandData[] = results.multiHandLandmarks.map((landmarks: any[]) => {
            const gesture = detectGesture(landmarks, displayWidth, displayHeight);
            const mapPt = (idx: number) => ({ x: (1 - landmarks[idx].x) * displayWidth, y: landmarks[idx].y * displayHeight });
            return {
            wrist: mapPt(0), indexTip: mapPt(8), middleTip: mapPt(12), ringTip: mapPt(16), pinkyTip: mapPt(20), thumbTip: mapPt(4),
            indexBase: mapPt(5), middleBase: mapPt(9), ringBase: mapPt(13), pinkyBase: mapPt(17),
            isOpen: gesture !== 'THUNDER', gesture, opacity: 1
            };
        });
        
        handDataRef.current = newHandData;
        let detectedCombo: string | null = null;

        if (newHandData.length === 2) {
            const g1 = newHandData[0].gesture;
            const g2 = newHandData[1].gesture;
            if (g1 !== 'NEUTRAL' && g2 !== 'NEUTRAL') detectedCombo = getCombo(g1, g2);
        }

        // --- COMBO LOGIC ---
        let currentFrameCombo = detectedCombo;

        // Check Cooldown for NEW detection
        if (currentFrameCombo) {
            const cdEnd = cooldownsRef.current[currentFrameCombo] || 0;
            if (Date.now() < cdEnd) {
                currentFrameCombo = null; 
            }
        }

        // Update Active Combo State
        if (currentFrameCombo) {
            // If new or different combo, reset trigger
            if (activeComboRef.current !== currentFrameCombo) {
                comboStartTimeRef.current = Date.now();
                highlightRef.current = 1.0; 
                playChime(currentFrameCombo);
                
                // Set Cooldown
                // Combo lasts 2s (Inferno 1s), Cooldown 8s
                const end = Date.now() + 8000; 
                cooldownsRef.current[currentFrameCombo] = end;
                setCooldowns(prev => ({...prev, [currentFrameCombo as string]: end}));
            } else {
                // Same combo holding: Refresh timer so it stays active while holding
                comboStartTimeRef.current = Date.now();
            }
            activeComboRef.current = currentFrameCombo;
        }

        // Determine Effective Visual Element
        let effectiveVisualCombo = null;
        if (activeComboRef.current) {
            // INFERNO only lasts 1 second, others 2 seconds
            const duration = activeComboRef.current === 'INFERNO' ? 1000 : 2000;
            if (Date.now() - comboStartTimeRef.current < duration) {
                effectiveVisualCombo = activeComboRef.current;
            } else {
                activeComboRef.current = null; // Expired
            }
        }

        let newElement = 'NEUTRAL';
        if (effectiveVisualCombo) {
            newElement = effectiveVisualCombo;
        } else {
            const activeHand = newHandData.find(h => h.gesture !== 'NEUTRAL');
            if (activeHand) newElement = activeHand.gesture;
        }

        setCurrentElement(newElement);

        } else {
            // Hand lost logic
            // Keep combo active if time remains
            let effectiveVisualCombo = null;
            if (activeComboRef.current) {
                 const duration = activeComboRef.current === 'INFERNO' ? 1000 : 2000;
                 if (Date.now() - comboStartTimeRef.current < duration) {
                     effectiveVisualCombo = activeComboRef.current;
                 } else {
                     activeComboRef.current = null;
                 }
            }

            if (effectiveVisualCombo) {
                // Keep showing combo even if hands lost
                // We might want to keep handDataRef populated with last known positions or just render effect at center?
                // For now, if hands are lost, we clear handData but keep currentElement
                // The visual loop handles 'comboName' present but hands missing by drawing at center or previous
                handDataRef.current = [];
                setCurrentElement(effectiveVisualCombo);
            } else {
                handDataRef.current = [];
                if (prevElementRef.current !== 'NEUTRAL') { prevElementRef.current = 'NEUTRAL'; setCurrentElement('NEUTRAL'); }
            }
        }
    } catch (error) {
        console.error("Gesture Processing Error:", error);
    }
  }, [width, height, playChime]);

  useEffect(() => {
    let hands: any = null;
    let isActive = true;
    let frameId: number;
    let lastVideoTime = -1;
    
    const MP_VERSION = "0.4.1675469240";

    const initHands = async () => {
       try {
           setDebugInfo("正在加载 AI 核心 (1/3)...");
           if (!(window as any).Hands) { 
               setTimeout(initHands, 500); 
               return; 
           }

           setDebugInfo("初始化视觉模型 (2/3)...");
           hands = new (window as any).Hands({ 
               locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}/${file}` 
           });
           
           hands.setOptions({ 
               maxNumHands: 2, 
               modelComplexity: 1, 
               minDetectionConfidence: 0.5, 
               minTrackingConfidence: 0.5 
           });
           
           hands.onResults(onResults);
           
           setDebugInfo("等待摄像头许可...");
           
           const processVideo = async () => {
             if (!isActive) return;
             if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
                 const video = webcamRef.current.video;
                 if (video.videoWidth > 0 && video.videoHeight > 0) {
                     if (video.currentTime !== lastVideoTime) {
                         lastVideoTime = video.currentTime;
                         try { 
                             // setDebugInfo("正在处理视频流...");
                             await hands.send({ image: video }); 
                         } catch (e) { 
                             // Silent fail for frame processing to avoid log spam
                         }
                     }
                 }
             }
             frameId = requestAnimationFrame(processVideo);
           };
           processVideo();
       } catch (error: any) {
           console.error("Initialization Error:", error);
           setLoadingError("AI 模型加载失败: " + error.message);
           setDebugInfo("系统错误");
       }
    };
    
    setTimeout(initHands, 500);

    return () => { isActive = false; if (frameId) cancelAnimationFrame(frameId); if (hands) hands.close(); };
  }, [onResults]);

  // --- GAME LOGIC ---

  const spawnBoss = (width: number, height: number, level: number) => {
      isBossActiveRef.current = true;
      const elements: ElementType[] = ['FIRE', 'WATER', 'WIND', 'THUNDER'];
      const element = elements[(level - 1) % 4];
      
      // Randomize spawn position (similar to spawnMonster)
      const edge = Math.floor(Math.random() * 4); // 0: Top, 1: Right, 2: Bottom, 3: Left
      let x = 0, y = 0;
      const offset = 100;

      switch(edge) {
          case 0: x = Math.random() * width; y = -offset; break;
          case 1: x = width + offset; y = Math.random() * height; break;
          case 2: x = Math.random() * width; y = height + offset; break;
          case 3: x = -offset; y = Math.random() * height; break;
      }

      const boss: Monster = {
          id: Date.now(),
          x,
          y,
          vx: 0, vy: 0, 
          hp: 1500 * (1 + level * 0.2),
          maxHp: 1500 * (1 + level * 0.2),
          element,
          radius: 50, // Reduced from 80
          scoreValue: 5000 * level,
          pulseOffset: 0,
          isBoss: true
      };
      monstersRef.current.push(boss);
      highlightRef.current = 1.0;
  };

  const spawnMonster = (width: number, height: number) => {
      if (isBossActiveRef.current) return; // Don't spawn small mobs during boss

      const edge = Math.floor(Math.random() * 4); // 0: Top, 1: Right, 2: Bottom, 3: Left
      let x = 0, y = 0;
      
      switch(edge) {
          case 0: x = Math.random() * width; y = -50; break;
          case 1: x = width + 50; y = Math.random() * height; break;
          case 2: x = Math.random() * width; y = height + 50; break;
          case 3: x = -50; y = Math.random() * height; break;
      }

      const elements: ElementType[] = ['FIRE', 'WATER', 'WIND', 'THUNDER'];
      const element = elements[Math.floor(Math.random() * elements.length)];

      const monster: Monster = {
          id: Date.now() + Math.random(),
          x, y,
          vx: 0, vy: 0,
          hp: 100 + (levelRef.current * 10), // Scaling HP
          maxHp: 100 + (levelRef.current * 10),
          element,
          radius: 20 + Math.random() * 10,
          scoreValue: 100 * levelRef.current,
          pulseOffset: Math.random() * Math.PI * 2,
          isBoss: false
      };
      // Small chance to spawn a Void Creature if combo is Void
      if (Math.random() < 0.05) monster.element = 'VOID' as ElementType;

      monstersRef.current.push(monster);
  };
  
  const spawnDamageNumber = (x: number, y: number, value: number, type: DamageNumber['type']) => {
      const angle = (Math.random() * Math.PI) / 2 + Math.PI / 4; // Spray upwards
      const speed = 2 + Math.random() * 2;
      damageNumbersRef.current.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y - 20,
          value: Math.floor(value),
          type,
          life: 30, // 30 frames = approx 0.5 second
          vx: Math.cos(angle) * speed,
          vy: -Math.abs(Math.sin(angle) * speed)
      });
  };

  // Distance from point p to line segment vw
  const distToSegmentSq = (p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) => {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
  };

  const drawVoidCreature = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pulse: number, hpPct: number, theme: Theme) => {
    // Core body (dark, undulating)
    ctx.fillStyle = theme.background;
    ctx.beginPath();
    const tentacles = 8;
    for (let i = 0; i <= tentacles * 2; i++) {
        const theta = (Math.PI * i) / tentacles;
        // Wobbly radius
        const rad = r * (0.8 + 0.2 * Math.sin(theta * 3 + Date.now() * 0.005) + 0.1 * pulse);
        const px = Math.cos(theta) * rad;
        const py = Math.sin(theta) * rad;
        if (i===0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = theme.primary; 
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing Eyes
    const eyeTime = Date.now() * 0.002;
    ctx.fillStyle = theme.core;
    ctx.shadowColor = theme.secondary;
    ctx.shadowBlur = 10;
    // Eye 1
    ctx.beginPath();
    ctx.ellipse(-r*0.3, -r*0.1 + Math.sin(eyeTime)*2, r*0.15, r*0.1, 0, 0, Math.PI*2);
    ctx.fill();
    // Eye 2
    ctx.beginPath();
    ctx.ellipse(r*0.3, -r*0.1 + Math.cos(eyeTime)*2, r*0.15, r*0.1, 0, 0, Math.PI*2);
    ctx.fill();
    // Eye 3 (Third eye)
    ctx.beginPath();
    ctx.ellipse(0, r*0.3, r*0.1, r*0.15, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HP Bar
    if (hpPct < 1) {
        ctx.fillStyle = 'red';
        ctx.fillRect(-r, -r - 15, r * 2 * hpPct, 4);
    }
  };

  const spawnParticles = (x: number, y: number, element: string, theme: Theme) => {
      const { speed, count } = settingsRef.current;
      const numParticles = Math.floor((element === 'NEUTRAL' ? 4 : 10) * count);

      for (let i = 0; i < numParticles; i++) {
          const angle = Math.random() * Math.PI * 2;
          const v = (2 + Math.random() * 3) * speed;
          
          let pType: ParticleType = 'ORB';
          if (element === 'WIND' || element === 'BLIZZARD') pType = Math.random() > 0.6 ? 'LEAF' : 'MIST';
          else if (element === 'WATER' || element === 'STEAM') pType = Math.random() > 0.6 ? 'DROP' : 'MIST';
          else if (element === 'FIRE' || element === 'INFERNO') pType = Math.random() > 0.4 ? 'EMBER' : 'SPARK';
          else if (element === 'THUNDER' || element === 'TEMPEST' || element === 'PLASMA') pType = 'SPARK';
          
          particlesRef.current.push({
              x, y,
              vx: Math.cos(angle) * v,
              vy: Math.sin(angle) * v,
              life: 20 + Math.random() * 20,
              maxLife: 40,
              size: 2 + Math.random() * 3,
              color: Math.random() < 0.5 ? theme.primary : theme.secondary,
              element: element as any,
              type: pType,
              angle: Math.random() * Math.PI * 2,
              angularVelocity: (Math.random() - 0.5) * 0.3
          });
      }
  };

  const updateMonsters = (ctx: CanvasRenderingContext2D, width: number, height: number, centerX: number, centerY: number, hands: HandData[]) => {
      const monsters = monstersRef.current;
      const activeCombo = activeComboRef.current;
      const time = Date.now() * 0.001;
      
      const getMultiplier = (spell: string, monsterEl: string) => {
          if (spell === 'FIRE' && monsterEl === 'WATER') return 2;
          if (spell === 'WATER' && monsterEl === 'FIRE') return 2;
          if (spell === 'THUNDER' && monsterEl === 'WIND') return 2;
          if (spell === 'WIND' && monsterEl === 'THUNDER') return 2;
          if (spell === 'BLIZZARD' || spell === 'INFERNO' || spell === 'TEMPEST' || spell === 'PLASMA') return 3;
          if (spell === 'VOID') return 5;
          return 1;
      };

      for (let i = monsters.length - 1; i >= 0; i--) {
          const m = monsters[i];
          const dx = centerX - m.x;
          const dy = centerY - m.y;
          const distToCenter = Math.sqrt(dx*dx + dy*dy);
          
          // Movement Logic: Scaling Speed
          const difficultySpeedMulti = difficulty === 'HARD' ? 1.5 : 1.0;
          let speed = m.isBoss ? 0.3 * difficultySpeedMulti : (2.0 + (levelRef.current * 0.2)) * difficultySpeedMulti; 
          
          // CONTINUOUS COMBO EFFECTS
          if (activeCombo === 'BLIZZARD') {
              speed *= 0.1; // Drastic Slow (Frozen)
          }
          // Note: Other combos do not slow monsters, as requested.

          // DYNAMIC MOVEMENT PATTERNS
          const angleToCenter = Math.atan2(dy, dx);
          let moveAngle = angleToCenter;
          
          const pattern = Math.floor((levelRef.current - 1) / 3) % 3; // Change every 3 levels

          if (pattern === 0) {
              // Levels 1-3: Basic Homing with slight noise
              moveAngle += Math.sin(time * 2 + m.id) * 0.1; 
          } else if (pattern === 1) {
              // Levels 4-6: Spiral / Orbiting approach
              // Adds a perpendicular component to the movement
              moveAngle += Math.sin(time * 3 + m.id) * 0.5;
          } else {
              // Levels 7+: Erratic / ZigZag
              if (Math.floor(time * 4 + m.id) % 2 === 0) {
                  moveAngle += 0.6;
              } else {
                  moveAngle -= 0.6;
              }
          }
          
          let moveX = Math.cos(moveAngle) * speed;
          let moveY = Math.sin(moveAngle) * speed;

          // Apply Physics Velocity (from Pushbacks/Plasma)
          m.x += m.vx;
          m.y += m.vy;
          // Dampen velocity - slightly more slippery to allow pushback
          m.vx *= 0.95;
          m.vy *= 0.95;
          
          // PLASMA: Gravity Well towards hands center
          if (activeCombo === 'PLASMA' && hands.length === 2 && !m.isBoss) {
              const midX = (hands[0].middleBase.x + hands[1].middleBase.x) / 2;
              const midY = (hands[0].middleBase.y + hands[1].middleBase.y) / 2;
              const pdx = midX - m.x;
              const pdy = midY - m.y;
              // Strong Pull Force
              m.vx += pdx * 0.02;
              m.vy += pdy * 0.02;
          } else if (activeCombo === 'PLASMA' && hands.length === 0 && !m.isBoss) {
              // If combo active but hands lost (persistence mode), pull to center
               const pdx = centerX - m.x;
               const pdy = centerY - m.y;
               m.vx += pdx * 0.02;
               m.vy += pdy * 0.02;
          }

          // INFERNO: 3-second continuous clear effect during combo
          if (activeCombo === 'INFERNO' && !m.isBoss) {
              m.hp -= 20; // Melt small mobs rapidly
          }
          if (activeCombo === 'INFERNO' && m.isBoss) {
              m.hp -= 2; // Damage boss over time
          }

          // TEMPEST: Continuous pushback
          if (activeCombo === 'TEMPEST' && !m.isBoss) {
               const pdx = m.x - centerX;
               const pdy = m.y - centerY;
               const plen = Math.sqrt(pdx*pdx + pdy*pdy) || 1;
               m.vx += (pdx/plen) * 1.5;
               m.vy += (pdy/plen) * 1.5;
          }

          m.x += moveX;
          m.y += moveY;

          // Draw Monster
          const mTheme = (THEMES as any)[m.element] || THEMES.NEUTRAL;
          ctx.save();
          ctx.translate(m.x, m.y);
          const pulse = 1 + Math.sin(Date.now() * 0.005 + m.pulseOffset) * 0.2;
          const scale = m.isBoss ? 2 : 1; 
          ctx.scale(pulse * scale, pulse * scale);
          
          if (m.isBoss) {
              // BOSS RENDER (Fixed: Always Spiky to prevent flicker and overlap issues)
              ctx.beginPath();
              const spikes = 12;
              const outerRadius = m.radius;
              const innerRadius = m.radius / 2;
              for (let j = 0; j < spikes * 2; j++) {
                 const r = j % 2 === 0 ? outerRadius : innerRadius;
                 const a = (Math.PI * j) / spikes;
                 ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
              }
              ctx.closePath();
              ctx.fillStyle = mTheme.background;
              ctx.fill();
              ctx.strokeStyle = mTheme.primary;
              ctx.lineWidth = 3;
              ctx.stroke();
              
              // Boss Health Bar above head
              ctx.fillStyle = 'red';
              ctx.fillRect(-30, -50, 60 * (m.hp / m.maxHp), 5);
              ctx.strokeStyle = 'white';
              ctx.strokeRect(-30, -50, 60, 5);

              // Boss Core
              ctx.shadowBlur = 15;
              ctx.shadowColor = mTheme.secondary;
              ctx.fillStyle = mTheme.core;
              ctx.beginPath();
              ctx.arc(0, 0, innerRadius * 0.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
          } else {
              // NORMAL MONSTER RENDER (Always Void Form, colored by Element)
              drawVoidCreature(ctx, 0, 0, m.radius, pulse, m.hp / m.maxHp, mTheme);
          }
          
          // Frozen Effect Overlay
          if (activeCombo === 'BLIZZARD') {
              ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
              ctx.fill();
          }

          ctx.restore();

          // Check Collision with Hands
          let hit = false;
          let damageTakenThisFrame = 0;
          let isWeaknessHit = false;

          // 1. Hand Point Collision
          for (const hand of hands) {
              if (hand.gesture !== 'NEUTRAL') {
                  const hx = hand.middleBase.x;
                  const hy = hand.middleBase.y;
                  const hDist = Math.hypot(hx - m.x, hy - m.y);
                  
                  const hitRadius = activeCombo ? 120 : 80;
                  
                  if (hDist < hitRadius + m.radius) {
                      const mult = getMultiplier(activeCombo || hand.gesture, m.element);
                      if (mult > 1) isWeaknessHit = true;
                      damageTakenThisFrame += 3 * mult;
                      hit = true;
                  }
              }
          }

          // 2. Combo Line Collision
          if (activeCombo && hands.length === 2) {
              const h1 = hands[0].middleBase;
              const h2 = hands[1].middleBase;
              const distSq = distToSegmentSq(m, h1, h2);
              // Line thickness approx 30px
              if (distSq < (m.radius + 30)**2) {
                   const mult = getMultiplier(activeCombo, m.element);
                   if (mult > 1) isWeaknessHit = true;
                   damageTakenThisFrame += 5 * mult; // Line does more damage
                   hit = true;
              }
          }

          // 3. Persistent Area Damage (if hands lost but combo active)
          if (activeCombo && hands.length === 0 && distToCenter < 150) {
              // AOE around center if persistence mode
              const mult = getMultiplier(activeCombo, m.element);
              if (mult > 1) isWeaknessHit = true;
              damageTakenThisFrame += 2 * mult;
              hit = true;
          }

          if (hit && damageTakenThisFrame > 0) {
              // Critical Hit Logic
              const isCrit = Math.random() < 0.1; // 10% Chance
              if (isCrit) {
                  damageTakenThisFrame *= 2;
              }

              m.hp -= damageTakenThisFrame;
              
              // Only spawn damage text occasionally to avoid lag/clutter if hitting every frame
              // Or spawn every frame but make them float out
              if (Math.random() > 0.5) { // 50% chance per frame to reduce clutter slightly or use a timer logic
                  let damageType: DamageNumber['type'] = 'NORMAL';
                  if (isCrit) damageType = 'CRIT';
                  else if (isWeaknessHit) damageType = 'WEAKNESS';
                  
                  spawnDamageNumber(m.x, m.y, damageTakenThisFrame, damageType);
              }

              if (Math.random() > 0.7) {
                  spawnParticles(m.x, m.y, activeCombo || 'NEUTRAL', mTheme);
              }
              // Flash
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(m.x, m.y, m.radius * (m.isBoss ? 3 : 1.5), 0, Math.PI*2);
              ctx.globalAlpha = 0.5;
              ctx.fill();
              ctx.restore();
          }

          // Death or Core Hit
          if (m.hp <= 0) {
              monsters.splice(i, 1);
              const mult = activeCombo ? 2 : 1; 
              scoreRef.current += m.scoreValue * mult;
              
              if (m.isBoss) {
                  // Boss Dead
                  spawnParticles(m.x, m.y, m.element, mTheme);
                  // Massive explosion
                  for(let k=0; k<5; k++) spawnParticles(m.x, m.y, m.element, mTheme);
                  
                  if (levelRef.current >= maxLevel) {
                      // Victory!
                      setIsVictory(true);
                      setIsGameOver(true);
                  } else {
                      levelRef.current = Math.min(levelRef.current + 1, maxLevel);
                      levelProgressRef.current = 0;
                      isBossActiveRef.current = false;
                      coreHealthRef.current = Math.min(100, coreHealthRef.current + 50); // Heal on boss kill
                  }
              } else {
                  spawnParticles(m.x, m.y, m.element, mTheme);
                  
                  // Progress update (adjusted for higher mob density)
                  // Normal (6x mobs) -> gain small XP
                  // Hard (16x mobs) -> gain very small XP to balance leveling speed
                  if (levelProgressRef.current < 100 && !isBossActiveRef.current) {
                      const xpGain = difficulty === 'HARD' ? 0.5 : 1; 
                      levelProgressRef.current += xpGain; 
                  }
              }
              
              playChime(m.element);
          } else if (distToCenter < (m.isBoss ? 80 : 40)) {
              // Hit Core
              if (!m.isBoss) monsters.splice(i, 1); // Boss doesn't disappear, just eats core
              
              const dmg = m.isBoss ? 1 : 10;
              coreHealthRef.current -= dmg;
              highlightRef.current = 1.0; 
              spawnParticles(centerX, centerY, 'NEUTRAL', THEMES['NEUTRAL']);
          }
      }
  };

  // --- PHYSICS ENGINE ---
  const updateParticles = (ctx: CanvasRenderingContext2D, width: number, height: number, centerX: number, centerY: number) => {
    ctx.shadowBlur = 0; 
    const { glow } = settingsRef.current;

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      
      if (p.element === 'WIND' || p.element === 'BLIZZARD') {
          p.vx *= 0.995; p.vy *= 0.995;
      } else {
          p.vx *= 0.98; p.vy *= 0.98;
      }

      switch (p.element) {
          case 'WIND':
          case 'BLIZZARD':
              const dx = p.x - centerX;
              const dy = p.y - centerY;
              const dist = Math.sqrt(dx*dx + dy*dy) + 1;
              const angle = Math.atan2(dy, dx);
              p.vx += Math.cos(angle + Math.PI/2) * 2.5; 
              p.vy += Math.sin(angle + Math.PI/2) * 2.5;
              p.vx -= (dx / dist) * 0.8;
              p.vy -= (dy / dist) * 0.8;
              p.angle += p.angularVelocity * 1.5; 
              break;
          case 'WATER':
          case 'STEAM':
              p.vy += 1.5; 
              p.x += Math.sin(p.life * 0.2) * 1.0;
              break;
          case 'THUNDER':
          case 'TEMPEST':
          case 'VOID':
              p.vx += (Math.random() - 0.5) * 6; 
              p.vy += (Math.random() - 0.5) * 6;
              if (Math.random() < 0.15) {
                  p.x += (Math.random() - 0.5) * 40;
                  p.y += (Math.random() - 0.5) * 40;
              }
              break;
          case 'FIRE':
          case 'INFERNO':
              p.vy -= 1.5; 
              p.vx += (Math.random() - 0.5) * 2.0;
              p.size *= 0.95; 
              break;
          default:
              p.vy -= 0.2;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.element !== 'FIRE') p.size *= 0.98;

      if (p.life <= 0 || p.size < 0.1 || p.y > height + 50 || p.y < -50 || p.x < -50 || p.x > width + 50) {
        particlesRef.current.splice(i, 1);
      } else {
        ctx.save();
        if (p.size > 2) {
             const shadowOffsetX = (p.x - centerX) * 0.05;
             const shadowOffsetY = (p.y - centerY) * 0.05;
             ctx.fillStyle = "rgba(0,0,0,0.3)";
             ctx.beginPath();
             ctx.arc(p.x + shadowOffsetX, p.y + shadowOffsetY, p.size * glow, 0, Math.PI*2);
             ctx.fill();
        }

        let alpha = Math.min(1, p.life / 10, (p.maxLife - p.life) / 5);
        if ((p.element === 'FIRE' || p.element === 'INFERNO') && p.size < 3.5 && p.type === 'EMBER') {
             alpha *= (0.5 + Math.random() * 0.5);
        }
        
        ctx.globalAlpha = alpha;
        const renderSize = p.size * glow;

        if (p.type === 'LEAF') {
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, renderSize, renderSize * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        } 
        else if (p.type === 'DROP') {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.5 * glow;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 4); 
            ctx.stroke();
        }
        else if (p.type === 'SPARK') {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2 * glow;
            ctx.beginPath();
            ctx.moveTo(p.x - p.vx, p.y - p.vy);
            ctx.lineTo(p.x + p.vx, p.y + p.vy);
            ctx.stroke();
        }
        else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, renderSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  const animate = useCallback((time: number) => {
    // If editing, pause game loop rendering to save resources/state
    if (isEditing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); 
    if (!ctx) return;

    // Camera Preview Rendering (Small Scale: 120x90)
    if (showCameraPreview && previewCanvasRef.current && webcamRef.current?.video) {
        const video = webcamRef.current.video;
        if (video.readyState === 4) {
            const pCtx = previewCanvasRef.current.getContext('2d');
            if (pCtx) {
                const w = 120;
                const h = 90;
                previewCanvasRef.current.width = w; 
                previewCanvasRef.current.height = h;
                // Mirror it
                pCtx.save();
                pCtx.translate(w, 0);
                pCtx.scale(-1, 1);
                pCtx.drawImage(video, 0, 0, w, h);
                pCtx.restore();
                
                // Add border
                pCtx.strokeStyle = 'rgba(217, 119, 6, 0.5)'; // Amber
                pCtx.lineWidth = 2;
                pCtx.strokeRect(0,0,w,h);
            }
        }
    }

    // Safety: wrap animation loop in try-catch to prevent freezes
    try {
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Safe Theme Fallback
        const theme = activeComboRef.current && COMBO_THEMES[activeComboRef.current] 
            ? COMBO_THEMES[activeComboRef.current] 
            : (THEMES[currentElement as ElementType] || THEMES['NEUTRAL']);
        
        ctx.globalCompositeOperation = 'source-over';
            
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, width, height);
        
        // Safety check for stale hand data
        if (Date.now() - lastHandUpdateRef.current > 3000 && handDataRef.current.length > 0) {
            handDataRef.current = [];
            activeComboRef.current = null;
            setCurrentElement('NEUTRAL');
        }

        if (highlightRef.current > 0.01) highlightRef.current *= 0.925; 
        else highlightRef.current = 0;
        const flash = highlightRef.current;

        // --- GAME LOGIC UPDATES ---
        if (hasStarted && !isGameOver) {
            monsterSpawnTimerRef.current++;
            const difficultyMulti = difficulty === 'HARD' ? 16 : 6; 
            const baseSpawnInterval = Math.max(10, 60 - (levelRef.current * 2)); 
            const spawnThreshold = Math.max(2, baseSpawnInterval / difficultyMulti);
            
            if (!isBossActiveRef.current && monsterSpawnTimerRef.current > spawnThreshold) {
                spawnMonster(width, height);
                monsterSpawnTimerRef.current = 0;
            }

            // Check for Boss Spawn
            if (!isBossActiveRef.current && levelProgressRef.current >= 100) {
                spawnBoss(width, height, levelRef.current);
            }

            if (coreHealthRef.current <= 0) {
                setIsGameOver(true);
            }
            
            // Update UI state occasionally
            if (monsterSpawnTimerRef.current % 10 === 0) {
                setUiScore(scoreRef.current);
                setUiHealth(coreHealthRef.current);
                setUiLevel(levelRef.current);
                setUiProgress(levelProgressRef.current);
            }
        }

        if (flash > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = '#FF0000'; // Damage flash
            ctx.lineWidth = 30 * flash; 
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#FF0000';
            ctx.globalAlpha = flash; 
            ctx.strokeRect(0, 0, width, height);
            ctx.restore();
        }

        let centerX = width / 2;
        let centerY = height / 2;
        const t = time * 0.001;
        const comboName = activeComboRef.current;

        // Draw Core
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(t * 0.5);
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 20 + Math.sin(t * 5) * 10;
        ctx.shadowColor = '#00FFFF';
        const coreSize = 30;
        ctx.beginPath();
        ctx.moveTo(0, -coreSize);
        ctx.lineTo(coreSize, 0);
        ctx.lineTo(0, coreSize);
        ctx.lineTo(-coreSize, 0);
        ctx.fill();
        
        // Core Health Ring
        ctx.rotate(-t * 0.5); 
        ctx.beginPath();
        ctx.arc(0, 0, 60, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 8;
        ctx.stroke();

        const hpPct = Math.max(0, coreHealthRef.current / 100);
        if (hpPct > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 60, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * hpPct));
            ctx.strokeStyle = hpPct > 0.3 ? '#00FF00' : '#FF0000';
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.stroke();
        }
        
        ctx.rotate(t * 0.5); 
        ctx.font = 'bold 20px Courier New';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(`${Math.ceil(coreHealthRef.current)}%`, 0, 0);
        ctx.restore();

        // 2. Geometry & Particles
        ctx.globalCompositeOperation = 'lighter'; 
        
        // Render Monsters
        updateMonsters(ctx, width, height, centerX, centerY, handDataRef.current);
        
        // Draw Damage Numbers
        ctx.save();
        for (let i = damageNumbersRef.current.length - 1; i >= 0; i--) {
            const dn = damageNumbersRef.current[i];
            dn.life--;
            dn.x += dn.vx;
            dn.y += dn.vy;
            dn.vy += 0.05; 
            
            if (dn.life <= 0) {
                damageNumbersRef.current.splice(i, 1);
            } else {
                ctx.globalAlpha = Math.min(1.0, dn.life / 10);
                if (dn.type === 'CRIT') {
                    ctx.font = 'bold 28px Arial';
                    ctx.fillStyle = '#FF0000'; // Red
                } else if (dn.type === 'WEAKNESS') {
                    ctx.font = 'bold 24px Arial';
                    ctx.fillStyle = '#FFFF00'; // Yellow
                } else {
                    ctx.font = '14px Arial';
                    ctx.fillStyle = '#FFFFFF'; // White
                }
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 4;
                ctx.fillText(dn.value.toString(), dn.x, dn.y);
            }
        }
        ctx.restore();

        // Draw Combo Effects
        if (comboName) {
            const hasHands = handDataRef.current.length === 2;
            let midX = centerX;
            let midY = centerY;
            
            if (hasHands) {
                const h1 = handDataRef.current[0];
                const h2 = handDataRef.current[1];
                midX = (h1.middleBase.x + h2.middleBase.x) / 2;
                midY = (h1.middleBase.y + h2.middleBase.y) / 2;
                
                // Connecting line
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(h1.middleBase.x, h1.middleBase.y);
                ctx.lineTo(h2.middleBase.x, h2.middleBase.y);
                ctx.strokeStyle = theme.primary;
                ctx.lineWidth = 20 + Math.sin(t * 10) * 5; 
                ctx.lineCap = 'round';
                ctx.shadowBlur = 20; 
                ctx.shadowColor = theme.secondary;
                ctx.globalAlpha = 0.4;
                ctx.stroke();
                ctx.restore();
                
                handDataRef.current.forEach(h => {
                    drawSkeleton(ctx, h);
                    const auraSize = 50 + Math.sin(t * 20) * 10;
                    const grad = ctx.createRadialGradient(h.middleBase.x, h.middleBase.y, 10, h.middleBase.x, h.middleBase.y, auraSize);
                    grad.addColorStop(0, theme.core);
                    grad.addColorStop(0.4, theme.primary);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.save();
                    ctx.fillStyle = grad;
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.arc(h.middleBase.x, h.middleBase.y, auraSize, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    drawRuneRing(ctx, h.middleBase.x, h.middleBase.y, 40, t*5, theme);
                });
            }

            drawRuneRing(ctx, midX, midY, 180, t, theme);
            drawSacredGeometry(ctx, midX, midY, 140, -t * 2, theme);
            spawnParticles(midX, midY, comboName, theme);

        } else if (handDataRef.current.length > 0) {
            handDataRef.current.forEach((hand) => {
            drawSkeleton(ctx, hand);
            const element = hand.gesture;
            const handTheme = (element !== 'NEUTRAL' && THEMES[element]) ? THEMES[element] : THEMES['NEUTRAL'];
            const centerX = hand.middleBase.x; 
            const centerY = hand.middleBase.y; 
            
            if (element !== 'NEUTRAL') {
                if (flash > 0.05 && highlightRef.current > 0.05) {
                    ctx.save();
                    ctx.translate(centerX, centerY);
                    const waveSize = 120 + (1 - flash) * 100;
                    ctx.beginPath();
                    ctx.arc(0, 0, waveSize, 0, Math.PI * 2);
                    ctx.lineWidth = 10 * flash;
                    ctx.strokeStyle = handTheme.core;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = handTheme.secondary;
                    ctx.globalAlpha = flash;
                    ctx.stroke();
                    ctx.restore();
                }

                drawRuneRing(ctx, centerX, centerY, 120, t * 0.5, handTheme);
                drawSacredGeometry(ctx, centerX, centerY, 90, -t * 1.5, handTheme);
                drawSquareLayer(ctx, centerX, centerY, 65, t * 2.5, handTheme);
                const pulse = Math.sin(time * 0.005) * 0.5 + 0.5;
                drawPentagram(ctx, centerX, centerY, 40, t, pulse, handTheme);
                spawnParticles(centerX, centerY, element, handTheme);
            } else {
                ctx.globalAlpha = 0.3;
                drawRuneRing(ctx, centerX, centerY, 50, t * 0.2, handTheme);
            }
            });
        }

        updateParticles(ctx, width, height, centerX, centerY);
    } catch (e) {
        console.warn("Animation Loop Error", e);
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [width, height, currentElement, hasStarted, isGameOver, isEditing, showCameraPreview]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [animate]);

  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center font-sans">
        
        {/* Dynamic Background */}
        <div 
            className="absolute inset-0 transition-colors duration-700 ease-in-out z-0"
            style={{ backgroundColor: currentTheme.background }}
        />

        {/* Hidden Webcam Source */}
        <Webcam 
            ref={webcamRef} 
            audio={false} 
            width={width} 
            height={height} 
            mirrored={true} 
            screenshotFormat="image/jpeg" 
            className="absolute opacity-0 pointer-events-none" 
            onUserMedia={() => setCameraReady(true)}
            onUserMediaError={(e: any) => setLoadingError("摄像头访问失败: " + e)}
        />
        
        {/* Canvas Layer */}
        <canvas ref={canvasRef} style={{ width, height }} className="absolute top-0 left-0 z-10" />
        
        {/* GAME OVER SCREEN */}
        {isGameOver && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 backdrop-blur-sm">
                <div className={`text-center p-8 border ${isVictory ? 'border-amber-500/50' : 'border-red-500/50'} rounded-xl bg-black/80 shadow-[0_0_50px_rgba(255,0,0,0.3)]`}>
                    <h2 className={`text-4xl font-bold ${isVictory ? 'text-amber-500' : 'text-red-500'} mb-4 tracking-widest`}>
                        {isVictory ? '🎉 维度守护者 🎉' : '能量核心崩溃'}
                    </h2>
                    {isVictory && <div className="text-xl text-white mb-2">成功抵御虚空入侵!</div>}
                    <div className="text-2xl text-white mb-6">最终得分: <span className="text-amber-500 font-mono">{uiScore}</span></div>
                    
                    {/* Difficulty Selection on Game Over */}
                    <div className="flex justify-center gap-4 mb-6">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDifficulty('NORMAL'); }}
                            className={`px-4 py-2 rounded font-bold border ${difficulty === 'NORMAL' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                        >
                            普通 (NORMAL)
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDifficulty('HARD'); }}
                            className={`px-4 py-2 rounded font-bold border ${difficulty === 'HARD' ? 'bg-red-600 border-red-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                        >
                            困难 (HARD)
                        </button>
                    </div>

                    <button 
                        onClick={startExperience}
                        className={`px-8 py-3 ${isVictory ? 'bg-amber-900 hover:bg-amber-700 border-amber-500' : 'bg-red-900 hover:bg-red-700 border-red-500'} text-white font-bold rounded border transition-colors`}
                    >
                        {isVictory ? '挑战更高难度' : '重启时间线'}
                    </button>
                </div>
             </div>
        )}

        {/* AI EDITING MODAL */}
        {isEditing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
                <div className="bg-neutral-900 border border-amber-500/30 rounded-xl p-6 max-w-4xl w-full flex flex-col md:flex-row gap-6 shadow-[0_0_50px_rgba(100,0,255,0.2)]">
                    
                    {/* Left: Input / Preview */}
                    <div className="flex-1 flex flex-col gap-4">
                         <h3 className="text-amber-500 text-xl font-bold tracking-widest uppercase">🔮 魔法视界 (Magic Lens)</h3>
                         <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
                             {capturedImage && (
                                 <img src={capturedImage} alt="Snapshot" className="w-full h-full object-contain opacity-70" />
                             )}
                             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                 <div className="text-white/50 text-xs uppercase tracking-widest">Original Feed</div>
                             </div>
                         </div>
                         
                         <div className="flex gap-2">
                             <input 
                                type="text" 
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                placeholder="Desribe how to warp reality (e.g. 'Turn monsters into glitch art')..."
                                className="flex-1 bg-black/50 border border-white/20 rounded px-4 py-2 text-white focus:border-amber-500 outline-none"
                             />
                             <button 
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className={`px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded transition-colors ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                             >
                                {isGenerating ? '咏唱中...' : '生成'}
                             </button>
                         </div>
                    </div>

                    {/* Right: Output */}
                    <div className="flex-1 flex flex-col gap-4">
                         <h3 className="text-purple-400 text-xl font-bold tracking-widest uppercase text-right">结果 (Result)</h3>
                         <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
                             {generatedImage ? (
                                 <img src={generatedImage} alt="Generated" className="w-full h-full object-contain" />
                             ) : (
                                 <div className="text-center p-8">
                                     {isGenerating ? (
                                         <div className="animate-pulse text-amber-500 font-mono">
                                             AI 正在重构现实...<br/>
                                             <span className="text-xs text-white/50">Gemini 2.5 Flash Image</span>
                                         </div>
                                     ) : (
                                         <div className="text-white/30 text-sm">等待魔法指令...</div>
                                     )}
                                 </div>
                             )}
                         </div>
                         <div className="flex justify-end gap-2">
                             <button 
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 border border-white/20 text-white/70 hover:bg-white/10 rounded"
                             >
                                返回战场
                             </button>
                             {generatedImage && (
                                 <a 
                                    href={generatedImage} 
                                    download="eldritch-arts-edit.png"
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
                                 >
                                    保存影像
                                 </a>
                             )}
                         </div>
                    </div>
                </div>
            </div>
        )}

        {!isModelLoaded && !isGameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90 z-50">
                <div className="flex flex-col items-center">
                    <div className="text-amber-500 font-mono text-xl animate-pulse tracking-widest mb-4">🔮 正在校准魔法维度...</div>
                    {loadingError ? (
                        <div className="text-red-500 font-bold bg-black/50 p-2 rounded">{loadingError}</div>
                    ) : (
                        <div className="w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 animate-[width_1s_ease-in-out_infinite]" style={{width: '50%'}}></div>
                        </div>
                    )}
                    <div className="mt-4 text-xs text-gray-400 font-mono">{debugInfo}</div>
                </div>
            </div>
        )}

        {!hasStarted && isModelLoaded && !isGameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 cursor-pointer backdrop-blur-sm">
                <div className="border border-amber-500/50 bg-black/80 p-8 rounded-lg text-center shadow-[0_0_30px_rgba(255,160,20,0.3)] hover:scale-105 transition-transform duration-300">
                    <h2 className="text-3xl font-bold text-amber-500 mb-2">准备就绪</h2>
                    <p className="text-white/80 mb-6">共 {maxLevel} 个关卡，请选择难度</p>
                    
                    <div className="flex justify-center gap-4 mb-6">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDifficulty('NORMAL'); }}
                            className={`px-4 py-2 rounded font-bold border ${difficulty === 'NORMAL' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                        >
                            普通 (NORMAL)
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDifficulty('HARD'); }}
                            className={`px-4 py-2 rounded font-bold border ${difficulty === 'HARD' ? 'bg-red-600 border-red-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                        >
                            困难 (HARD)
                        </button>
                    </div>

                    <button 
                        onClick={startExperience}
                        className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded w-full"
                    >
                        开始守护
                    </button>
                </div>
            </div>
        )}

        {/* Dynamic Spell Name */}
        <div className="absolute top-24 left-0 w-full flex justify-center z-20 pointer-events-none">
             <div className={`text-4xl md:text-5xl font-bold tracking-widest transition-all duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] px-8 py-2 rounded-full ${highlightRef.current > 0.1 ? 'scale-110 bg-black/20 backdrop-blur-sm' : ''} ${
                currentElement === 'FIRE' ? 'text-orange-500' :
                currentElement === 'WATER' ? 'text-blue-500' :
                currentElement === 'WIND' ? 'text-cyan-300' :
                currentElement === 'THUNDER' ? 'text-purple-500' : 
                currentElement === 'INFERNO' ? 'text-red-600' :
                currentElement === 'BLIZZARD' ? 'text-cyan-100' :
                currentElement === 'VOID' ? 'text-violet-400' : 'text-amber-400'
            }`}>
                {ELEMENT_NAMES_CN[currentElement]}
            </div>
        </div>
        
        {/* LEFT SIDEBAR - GAME RULES (Repositioned to Bottom-Left) */}
        <button
            onClick={() => setShowRules(!showRules)}
            className={`absolute left-0 top-48 z-30 p-2 bg-black/60 text-amber-500 border-y border-r border-white/10 rounded-r-xl hover:bg-black/80 transition-all duration-300 ${showRules ? 'translate-x-64' : 'translate-x-0'}`}
        >
            {showRules ? '◀' : '▶'}
        </button>

        <div className={`absolute left-0 top-48 bottom-0 z-20 transition-transform duration-300 ${showRules ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="bg-black/60 backdrop-blur-md border-r border-white/10 p-6 rounded-tr-xl text-left w-64 shadow-[0_0_20px_rgba(0,0,0,0.5)] h-full overflow-y-auto flex flex-col justify-start pt-12">
                <h4 className="text-amber-500 text-sm font-bold uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
                    作战法则
                </h4>

                <div className="space-y-6 text-xs text-white/80 font-mono">
                    {/* Goal */}
                    <div>
                        <div className="text-amber-400 font-bold mb-1 flex items-center gap-2">
                            <span>🛡️</span> 守护核心
                        </div>
                        <p className="opacity-70 leading-relaxed">
                            阻止虚空生物接触中央晶体。<br/>
                            BOSS战需全力集火输出。
                        </p>
                    </div>

                    {/* Counters */}
                    <div>
                        <div className="text-blue-400 font-bold mb-2 flex items-center gap-2">
                            <span>⚔️</span> 元素克制 (200%)
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/5">
                                <span className="text-orange-500 font-bold">火 FIRE</span>
                                <span className="text-gray-400 font-bold text-lg">⇄</span>
                                <span className="text-cyan-500 font-bold">水 WATER</span>
                            </div>
                            <div className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/5">
                                <span className="text-purple-500 font-bold">雷 THUNDER</span>
                                <span className="text-gray-400 font-bold text-lg">⇄</span>
                                <span className="text-green-400 font-bold">风 WIND</span>
                            </div>
                        </div>
                    </div>

                    {/* Combos */}
                    <div>
                        <div className="text-purple-400 font-bold mb-1 flex items-center gap-2">
                            <span>✨</span> 连携技加成
                        </div>
                        <ul className="list-disc pl-4 space-y-1 opacity-70">
                            <li>双元素组合: <span className="text-amber-400 font-bold">300%</span> 伤害</li>
                            <li>虚空奇点: <span className="text-violet-400 font-bold">500%</span> 伤害</li>
                            <li><span className="text-red-500 font-bold">地狱火</span>: 持续1秒，超高爆发</li>
                        </ul>
                    </div>

                    {/* Score */}
                     <div>
                        <div className="text-green-400 font-bold mb-1 flex items-center gap-2">
                            <span>🏆</span> 得分规则
                        </div>
                        <p className="opacity-70">
                            击杀得分随难度提升。<br/>
                            <span className="text-yellow-200">连击</span> 或 <span className="text-yellow-200">克制</span> 击杀获得双倍分数。
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* TOP HUD - LEVEL & SCORE */}
        {hasStarted && (
            <>
                {/* Top Center: Level Progress */}
                <div className="absolute top-0 left-0 w-full h-2 z-30 bg-gray-800">
                    <div 
                        className={`h-full transition-all duration-300 ease-out ${uiProgress >= 100 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, uiProgress)}%` }}
                    />
                </div>
                {uiProgress >= 100 && (
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-red-500 font-bold animate-pulse text-xl tracking-[0.5em] bg-black/50 px-4 py-1 rounded">BOSS ENCOUNTER</div>
                )}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 text-xs text-amber-500 font-mono tracking-widest bg-black/40 px-2 rounded">
                    LEVEL {uiLevel} / {maxLevel} {difficulty === 'HARD' ? '💀' : ''}
                </div>

                {/* Top Right: Score */}
                <div className="absolute top-6 right-6 z-30 text-right">
                    <div className="text-xs text-amber-500/80 uppercase tracking-widest">Score</div>
                    <div className="text-3xl font-mono text-white font-bold tabular-nums drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                        {uiScore.toLocaleString()}
                    </div>
                </div>
            </>
        )}

        {/* BOTTOM HUD - ENLARGED GUIDES & COOLDOWNS */}
        {hasStarted && (
            <div className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-end z-20 pb-16 pointer-events-none">
                 
                 {/* Guide Panels (Scaled Up) */}
                 <div className="flex flex-col md:flex-row gap-4 mb-4 px-4 max-w-6xl mx-auto opacity-90 hover:opacity-100 transition-opacity duration-300 pointer-events-auto origin-bottom">
                      {/* Combo Guide */}
                      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-lg flex-1">
                        <div className="grid grid-cols-4 gap-4 text-white/90 text-sm">
                             {[
                                { id: 'BLIZZARD', name: '❄️ 极寒', req: '水+风', desc: '(全屏减速)', color: 'text-cyan-300' },
                                { id: 'PLASMA', name: '⚛️ 等离子', req: '火+风', desc: '(强力聚怪)', color: 'text-purple-400' },
                                { id: 'TEMPEST', name: '⛈️ 风眼', req: '雷+水', desc: '(震荡击退)', color: 'text-blue-500' },
                                { id: 'INFERNO', name: '🌋 地狱火', req: '火+火', desc: '(清屏轰炸)', color: 'text-red-500' }
                             ].map(spell => {
                                 const cdEnd = cooldowns[spell.id] || 0;
                                 const remaining = Math.max(0, (cdEnd - nowTime) / 1000);
                                 const onCooldown = remaining > 0;
                                 
                                 return (
                                     <div key={spell.id} className="text-center relative overflow-hidden rounded p-1">
                                        <span className={`${spell.color} font-bold block text-sm md:text-base`}>{spell.name}</span>
                                        <span className="text-xs text-gray-300 block">{spell.req}</span>
                                        <span className="text-[10px] text-gray-500 block">{spell.desc}</span>
                                        
                                        {/* Cooldown Overlay */}
                                        {onCooldown && (
                                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                                <div className="text-white font-mono text-lg font-bold">
                                                    {remaining.toFixed(1)}s
                                                </div>
                                            </div>
                                        )}
                                        {onCooldown && (
                                            <div 
                                                className="absolute bottom-0 left-0 h-1 bg-white/50" 
                                                style={{ width: `${(remaining/5)*100}%` }}
                                            />
                                        )}
                                    </div>
                                 );
                             })}
                        </div>
                      </div>

                      {/* Basic Gesture Guide */}
                      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-lg flex gap-6 items-center">
                           <div className="text-center">
                                <span className="text-2xl block">✋</span>
                                <span className="text-xs text-orange-400 font-bold block mt-1">火</span>
                           </div>
                           <div className="text-center">
                                <span className="text-2xl block">👇</span>
                                <span className="text-xs text-blue-400 font-bold block mt-1">水</span>
                           </div>
                           <div className="text-center">
                                <span className="text-2xl block">👊</span>
                                <span className="text-xs text-purple-400 font-bold block mt-1">雷</span>
                           </div>
                           <div className="text-center">
                                <span className="text-2xl block">✌️</span>
                                <span className="text-xs text-teal-300 font-bold block mt-1">风</span>
                           </div>
                      </div>
                 </div>
            </div>
        )}

        {/* AI EDIT TOGGLE BUTTON */}
        <div className="absolute bottom-4 right-4 z-30">
            <button 
                onClick={handleSnapshot}
                disabled={!hasStarted}
                className={`bg-purple-900/80 border border-purple-500/50 p-3 rounded-full hover:bg-purple-700 hover:scale-105 transition-all text-white font-bold shadow-[0_0_15px_rgba(160,0,255,0.4)] ${!hasStarted ? 'opacity-50 grayscale' : ''}`}
                title="Open Magic Lens (AI Edit)"
            >
                👁️ 魔法视界
            </button>
        </div>

        {/* Toggle Controls Button */}
        <div className="absolute top-20 right-4 z-30">
            <button 
                onClick={() => setShowControls(!showControls)}
                className="bg-black/40 border border-white/10 p-2 rounded hover:bg-white/10 transition-colors text-white/50 text-xs uppercase font-mono tracking-wider"
            >
                {showControls ? 'Hide Controls' : 'Show Controls'}
            </button>
        </div>
        
        {/* NEW: Camera Preview (Top-Left) (Reduced Size: 120x90) */}
        <div className="absolute top-4 left-4 z-50 flex flex-col items-start gap-2">
            <button 
                onClick={() => setShowCameraPreview(!showCameraPreview)}
                className="bg-black/40 border border-amber-500/30 text-amber-500/80 px-2 py-1 rounded text-xs hover:bg-black/60 transition-colors"
            >
                {showCameraPreview ? '📸 Hide Cam' : '📸 Show Cam'}
            </button>
            <div className={`transition-all duration-300 overflow-hidden rounded-lg border border-amber-500/30 shadow-lg ${showCameraPreview ? 'w-[120px] h-[90px] opacity-100' : 'w-0 h-0 opacity-0'}`}>
                <canvas ref={previewCanvasRef} className="w-full h-full bg-black/80" />
            </div>
            
             {/* Debug Info - Moved below camera preview */}
            <div className="text-xs text-amber-200/60 font-mono tracking-tight bg-black/40 px-2 py-1 rounded mt-1">
                {debugInfo}
            </div>
        </div>

        {/* PARTICLE CONTROLS PANEL (Hidden by Default) */}
        {showControls && (
            <div className="absolute top-28 right-4 z-30 w-64 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-2xl animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-amber-500 text-xs font-bold uppercase tracking-widest mb-4 border-b border-white/10 pb-2">粒子引擎参数</h3>
                
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs text-white/70 mb-1">
                            <span>速度 (Velocity)</span>
                            <span className="font-mono text-amber-400">{settings.speed.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="10.0" step="0.1" 
                            value={settings.speed}
                            onChange={(e) => setSettings({...settings, speed: parseFloat(e.target.value)})}
                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                    </div>
                    
                    <div>
                        <div className="flex justify-between text-xs text-white/70 mb-1">
                            <span>数量 (Density)</span>
                            <span className="font-mono text-amber-400">{settings.count.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="5.0" step="0.1" 
                            value={settings.count}
                            onChange={(e) => setSettings({...settings, count: parseFloat(e.target.value)})}
                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                    </div>
                    
                    <div>
                        <div className="flex justify-between text-xs text-white/70 mb-1">
                            <span>光效 (Glow)</span>
                            <span className="font-mono text-amber-400">{settings.glow.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="3.0" step="0.1" 
                            value={settings.glow}
                            onChange={(e) => setSettings({...settings, glow: parseFloat(e.target.value)})}
                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                    </div>
                </div>
            </div>
        )}
        
        {/* Author Watermark - Mono Italic Font */}
        <div className="absolute bottom-4 left-0 w-full text-center z-20 pointer-events-none opacity-80 hover:opacity-100 transition-opacity">
            <span className="text-lg text-amber-500/80 font-bold font-mono italic tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Designed by soda | WeChat: scroll233
            </span>
        </div>
    </div>
  );
};

export default MagicOverlay;