import "@testing-library/jest-dom/vitest";

// Mock canvas for jsbarcode text measurement in jsdom
// Store the original getContext if it exists
const originalGetContext = HTMLCanvasElement.prototype.getContext;

// Create a mock context that provides the methods jsbarcode needs
function createMockContext(): any {
  return {
    font: "",
    globalAlpha: 1,
    measureText: (text: string) => ({ width: text.length * 7 }),
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => [],
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
  };
}

// Replace getContext unconditionally
(HTMLCanvasElement.prototype as any).getContext = function (contextType: string) {
  if (contextType === "2d") {
    return createMockContext();
  }
  return null;
};
