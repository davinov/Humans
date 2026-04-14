// Canvas-based pattern generators for MapLibre fill-pattern images.

function parseHex(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function makeImageData(w: number, h: number, fillFn: (data: Uint8ClampedArray, w: number, h: number) => void): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, w, h);
    fillFn(img.data, w, h);
    ctx.putImageData(img, 0, 0);
    return ctx.getImageData(0, 0, w, h);
}

/** Crosshatch: thin ↘ and ↙ diagonals — used for error (outside zone). */
export function generateCrosshatchPattern(hexColor: string): ImageData {
    const [r, g, b] = parseHex(hexColor);
    const N = 10; const w = 1;
    return makeImageData(N, N, (d) => {
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if ((x + y) % N < w || ((x - y + N * 2) % N) < w) {
                    const i = (y * N + x) * 4;
                    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 200;
                }
            }
        }
    });
}

/** Dashed horizontal lines — used for warning (overlap). */
export function generateDashedHorizontalPattern(hexColor: string): ImageData {
    const [r, g, b] = parseHex(hexColor);
    const W = 10; const H = 7;
    const dashW = 6; const lineH = 1;
    return makeImageData(W, H, (d) => {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (y < lineH && x < dashW) {
                    const i = (y * W + x) * 4;
                    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 160;
                }
            }
        }
    });
}

/** Horizontal rainbow stripes — used for the "surprise" sound zone. */
export function generateRainbowPattern(): ImageData {
    const size = 60;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const colors = ['#ff0000', '#ff8800', '#ffcc00', '#33cc55', '#3388ff', '#cc00cc'];
    const stripeH = size / colors.length;
    for (let i = 0; i < colors.length; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(0, i * stripeH, size, stripeH);
    }
    return ctx.getImageData(0, 0, size, size);
}
