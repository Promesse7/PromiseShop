import "@testing-library/jest-dom/vitest";

// Polyfill canvas for jsbarcode text measurement in jsdom
const originalGetContext = HTMLCanvasElement.prototype.getContext;

const mockGetContext: (
  this: HTMLCanvasElement,
  contextType: string
) => CanvasRenderingContext2D | null = function (
  contextType: string
): CanvasRenderingContext2D | null {
  if (contextType === "2d") {
    return {
      font: "",
      globalAlpha: 1,
      measureText: (text: string) => ({ width: text.length * 7 }),
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] } as unknown as ImageData),
      putImageData: () => {},
      createImageData: () => [] as unknown as ImageData,
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
    } as unknown as CanvasRenderingContext2D;
  }
  // Delegate to original implementation for other context types
  return originalGetContext.call(this, contextType) as unknown as CanvasRenderingContext2D | null;
};

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: mockGetContext,
  writable: true,
  enumerable: false,
  configurable: true,
});
