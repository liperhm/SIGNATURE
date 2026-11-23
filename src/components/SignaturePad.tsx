import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  /** Width of the canvas when this stroke was drawn, used for proportional resize scaling */
  refWidth: number;
  /** Height of the canvas when this stroke was drawn */
  refHeight: number;
}

export interface SignaturePadHandle {
  clear: () => void;
  undo: () => void;
  exportWhiteBgJpeg: () => string;
  hasSignature: () => boolean;
}

interface SignaturePadProps {
  disabled?: boolean;
  onChange?: (hasSignature: boolean, strokeCount: number) => void;
  onDrawStart?: () => void;
}

const INK_COLOR = '#0f172a';
const STROKE_WIDTH = 2.6;

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ disabled = false, onChange, onDrawStart }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const lastCanvasWidthRef = useRef<number>(0);

    const [isDrawing, setIsDrawing] = useState(false);
    const [strokeCount, setStrokeCount] = useState(0);

    const configureContext = useCallback((ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = INK_COLOR;
      ctx.fillStyle = INK_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, []);

    const drawStroke = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        stroke: Stroke,
        targetWidth: number,
        targetHeight: number
      ) => {
        const { points, refWidth, refHeight } = stroke;
        if (points.length === 0) return;

        const scaleX = refWidth > 0 ? targetWidth / refWidth : 1;
        const scaleY = refHeight > 0 ? targetHeight / refHeight : 1;

        const scalePt = (pt: Point): Point => ({
          x: pt.x * scaleX,
          y: pt.y * scaleY,
        });

        const first = scalePt(points[0]);
        ctx.beginPath();
        ctx.arc(first.x, first.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();

        if (points.length === 1) return;

        if (points.length === 2) {
          const second = scalePt(points[1]);
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(second.x, second.y);
          ctx.stroke();
          return;
        }

        for (let i = 2; i < points.length; i++) {
          const p0 = scalePt(points[i - 2]);
          const p1 = scalePt(points[i - 1]);
          const p2 = scalePt(points[i]);

          const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

          ctx.beginPath();
          ctx.moveTo(mid1.x, mid1.y);
          ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
          ctx.stroke();
        }

        const prev = scalePt(points[points.length - 2]);
        const last = scalePt(points[points.length - 1]);
        const lastMid = { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 };
        ctx.beginPath();
        ctx.moveTo(lastMid.x, lastMid.y);
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      },
      []
    );

    const redrawAll = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      ctx.clearRect(0, 0, rect.width, rect.height);
      configureContext(ctx);

      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke, rect.width, rect.height);
      }
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current, rect.width, rect.height);
      }
    }, [configureContext, drawStroke]);

    const resizeCanvas = useCallback(
      (preserveDrawing = true) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        // Avoid wiping or distorting signature on mobile URL-bar height shifts if width hasn't changed
        if (
          preserveDrawing &&
          lastCanvasWidthRef.current === rect.width &&
          canvas.width > 0
        ) {
          return;
        }

        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        lastCanvasWidthRef.current = rect.width;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        configureContext(ctx);

        if (preserveDrawing && strokesRef.current.length > 0) {
          for (const stroke of strokesRef.current) {
            drawStroke(ctx, stroke, rect.width, rect.height);
          }
        }
      },
      [configureContext, drawStroke]
    );

    useEffect(() => {
      resizeCanvas(false);
      const handleResize = () => resizeCanvas(true);
      window.addEventListener('resize', handleResize);

      const canvas = canvasRef.current;
      let observer: ResizeObserver | null = null;
      if (canvas && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => resizeCanvas(true));
        observer.observe(canvas);
      }

      return () => {
        window.removeEventListener('resize', handleResize);
        observer?.disconnect();
      };
    }, [resizeCanvas]);

    const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (activePointerIdRef.current !== null) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      activePointerIdRef.current = event.pointerId;
      canvas.setPointerCapture(event.pointerId);

      const rect = canvas.getBoundingClientRect();
      const pt = getCanvasPoint(event);

      const newStroke: Stroke = {
        points: [pt],
        refWidth: rect.width,
        refHeight: rect.height,
      };
      currentStrokeRef.current = newStroke;

      configureContext(ctx);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();

      setIsDrawing(true);
      if (strokesRef.current.length === 0) {
        onChange?.(true, 1);
      }
      onDrawStart?.();
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || event.pointerId !== activePointerIdRef.current) return;
      const canvas = canvasRef.current;
      const stroke = currentStrokeRef.current;
      if (!canvas || !stroke) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pt = getCanvasPoint(event);
      stroke.points.push(pt);
      const pts = stroke.points;

      if (pts.length < 3) {
        const prev = pts[pts.length - 2];
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        return;
      }

      const p0 = pts[pts.length - 3];
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];

      const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      ctx.beginPath();
      ctx.moveTo(mid1.x, mid1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
      ctx.stroke();
    };

    const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || event.pointerId !== activePointerIdRef.current) return;
      const canvas = canvasRef.current;
      const stroke = currentStrokeRef.current;

      if (canvas && stroke) {
        const ctx = canvas.getContext('2d');
        const pts = stroke.points;
        if (ctx && pts.length >= 2) {
          const last = pts[pts.length - 1];
          const prev = pts[pts.length - 2];
          const mid = { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 };
          ctx.beginPath();
          ctx.moveTo(mid.x, mid.y);
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }

        strokesRef.current = [...strokesRef.current, stroke];
        const count = strokesRef.current.length;
        setStrokeCount(count);
        onChange?.(count > 0, count);
      }

      currentStrokeRef.current = null;
      activePointerIdRef.current = null;
      setIsDrawing(false);
    };

    const clear = useCallback(() => {
      strokesRef.current = [];
      currentStrokeRef.current = null;
      activePointerIdRef.current = null;
      setIsDrawing(false);
      setStrokeCount(0);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        if (ctx && rect.width && rect.height) {
          ctx.clearRect(0, 0, rect.width, rect.height);
        }
      }
      onChange?.(false, 0);
    }, [onChange]);

    const undo = useCallback(() => {
      if (strokesRef.current.length === 0) return;
      strokesRef.current = strokesRef.current.slice(0, -1);
      const count = strokesRef.current.length;
      setStrokeCount(count);
      redrawAll();
      onChange?.(count > 0, count);
    }, [onChange, redrawAll]);

    const exportWhiteBgJpeg = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return '';

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;

      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) return '';

      // Fill solid white background so JPEG never renders transparent areas as black
      exportCtx.fillStyle = '#ffffff';
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportCtx.drawImage(canvas, 0, 0);

      return exportCanvas.toDataURL('image/jpeg', 0.92);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        clear,
        undo,
        exportWhiteBgJpeg,
        hasSignature: () => strokesRef.current.length > 0 || currentStrokeRef.current !== null,
      }),
      [clear, undo, exportWhiteBgJpeg]
    );

    const isEmpty = strokeCount === 0 && !isDrawing;

    return (
      <div
        className={`relative w-full h-[220px] sm:h-[260px] rounded-xl bg-white overflow-hidden transition-colors duration-150 ${
          isDrawing
            ? 'border-2 border-blue-600 ring-3 ring-blue-600/12'
            : 'border border-dashed border-slate-300 hover:border-slate-400'
        } ${disabled ? 'opacity-65 pointer-events-none' : ''}`}
      >
        {/* Non-exported baseline guide for signing alignment */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 bottom-11 flex items-end gap-2"
        >
          <span className="text-sm font-medium text-slate-300 select-none leading-none pb-0.5">
            ×
          </span>
          <div className="flex-1 border-b border-slate-200/90" />
        </div>

        <canvas
          ref={canvasRef}
          aria-label="Signature pad"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="relative z-10 block w-full h-full touch-none cursor-crosshair select-none"
        />

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-0 flex items-center justify-center transition-opacity duration-150 ${
            isEmpty ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="text-sm font-medium text-slate-400">Sign here</span>
        </div>
      </div>
    );
  }
);
