import React, { useMemo, useRef, useState } from "react";

export default function IndianFlagValidator() {
    const [file, setFile] = useState(null);
    const [imgUrl, setImgUrl] = useState("");
    const [report, setReport] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");

    const canvasRef = useRef(null);

    const TARGET = {
        aspectRatio: 3 / 2, 
        colors: {
            saffron: [255, 153, 51], 
            white: [255, 255, 255],  
            green: [19, 136, 8],    
            chakra: [0, 0, 128], 
        },
    };

    const LIMITS = {
        aspectTolerance: 0.01, 
        colorTolerancePct: 5,  
    };

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function pct(n) { return `${(n * 100).toFixed(2)}%`; }

    function channelDeviation(a, b) {
        return Math.abs(a - b) / 255;
    }

    function avgColorOfRow(imgData, width, rowIndex) {
        const { data } = imgData;
        let r = 0, g = 0, b = 0;
        const start = rowIndex * width * 4;
        for (let x = 0; x < width; x++) {
            const i = start + x * 4;
            r += data[i + 0];
            g += data[i + 1];
            b += data[i + 2];
        }
        const n = width;
        return [r / n, g / n, b / n];
    }

    function avgColorOfBand(imgData, width, yStart, yEnd, xMarginFrac = 0.1) {
        const { data, height } = imgData;
        const y0 = clamp(Math.floor(yStart), 0, height - 1);
        const y1 = clamp(Math.floor(yEnd), 0, height - 1);
        const x0 = Math.floor(width * xMarginFrac);
        const x1 = Math.ceil(width * (1 - xMarginFrac));
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = (y * width + x) * 4;
                r += data[i + 0];
                g += data[i + 1];
                b += data[i + 2];
                n++;
            }
        }
        return [r / n, g / n, b / n];
    }

    function colorDeviationPct(actual, target) {
        const dr = channelDeviation(actual[0], target[0]);
        const dg = channelDeviation(actual[1], target[1]);
        const db = channelDeviation(actual[2], target[2]);
        const avg = (dr + dg + db) / 3;
        return avg * 100;
    }

    function withinColorTolerance(actual, target, tolPct = LIMITS.colorTolerancePct) {
        const threshold = tolPct / 100;
        const dr = channelDeviation(actual[0], target[0]);
        const dg = channelDeviation(actual[1], target[1]);
        const db = channelDeviation(actual[2], target[2]);
        return dr <= threshold && dg <= threshold && db <= threshold;
    }

    function nearestStripeColor(rgb) {
        const { saffron, white, green } = TARGET.colors;
        const d = (a, b) => {
            const dr = a[0] - b[0];
            const dg = a[1] - b[1];
            const db = a[2] - b[2];
            return dr * dr + dg * dg + db * db;
        };
        const distances = [
            { name: "saffron", dist: d(rgb, saffron) },
            { name: "white", dist: d(rgb, white) },
            { name: "green", dist: d(rgb, green) },
        ];
        distances.sort((a, b) => a.dist - b.dist);
        return distances[0].name;
    }

    function classifyStripeHeights(imgData, width, height) {
        const labels = new Array(height);
        for (let y = 0; y < height; y++) {
            const rgb = avgColorOfRow(imgData, width, y);
            labels[y] = nearestStripeColor(rgb);
        }
        const runs = [];
        let start = 0;
        for (let y = 1; y < height; y++) {
            if (labels[y] !== labels[y - 1]) {
                runs.push({ label: labels[start], y0: start, y1: y - 1, size: y - start });
                start = y;
            }
        }
        runs.push({ label: labels[start], y0: start, y1: height - 1, size: height - start });

        let topH = height / 3, midH = height / 3, botH = height / 3;
        let top = runs.find(r => r.label === "saffron");
        let mid = runs.find(r => r.label === "white" && r.y0 > (top?.y1 ?? -1));
        let bot = runs.find(r => r.label === "green" && r.y0 > (mid?.y1 ?? -1));

        if (top && mid && bot) {
            topH = top.size;
            midH = mid.size;
            botH = bot.size;
        }

        return {
            top: topH / height,
            middle: midH / height,
            bottom: botH / height,
            boundaries: {
                yTopEnd: (top?.y1 ?? Math.floor(height / 3) - 1),
                yMidEnd: (mid?.y1 ?? Math.floor((2 * height) / 3) - 1),
            }
        };
    }

    function detectChakraMetrics(imgData, width, height, whiteBand) {
        const { chakra } = TARGET.colors;
        const tol = LIMITS.colorTolerancePct / 100;
        const { data } = imgData;
        const y0 = clamp(Math.floor(whiteBand.y0), 0, height - 1);
        const y1 = clamp(Math.floor(whiteBand.y1), 0, height - 1);

        const bluePts = [];

        for (let y = y0; y <= y1; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const r = data[i + 0], g = data[i + 1], b = data[i + 2];
                const dr = Math.abs(r - chakra[0]) / 255;
                const dg = Math.abs(g - chakra[1]) / 255;
                const db = Math.abs(b - chakra[2]) / 255;
                if (dr <= tol && dg <= tol && db <= tol) {
                    bluePts.push({ x, y });
                }
            }
        }

        if (bluePts.length < 50) {
            return { present: false, reason: "Not enough chakra-blue pixels detected" };
        }

        let sx = 0, sy = 0;
        for (const p of bluePts) { sx += p.x; sy += p.y; }
        const cx = sx / bluePts.length;
        const cy = sy / bluePts.length;

        let maxR2 = 0;
        for (const p of bluePts) {
            const dx = p.x - cx; const dy = p.y - cy;
            const r2 = dx * dx + dy * dy;
            if (r2 > maxR2) maxR2 = r2;
        }
        const radius = Math.sqrt(maxR2);

        const centerX = width / 2;
        const centerY = (whiteBand.y0 + whiteBand.y1) / 2;
        const offsetX = cx - centerX;
        const offsetY = cy - centerY;

        const whiteHeight = whiteBand.y1 - whiteBand.y0 + 1;
        const estDiameter = 2 * radius;
        const targetDiameter = 0.75 * whiteHeight;
        const diameterDeviation = Math.abs(estDiameter - targetDiameter) / targetDiameter;

        const bins = 720;
        const hist = new Float32Array(bins);
        for (const p of bluePts) {
            const angle = Math.atan2(p.y - cy, p.x - cx);
            let a = angle >= 0 ? angle : angle + Math.PI * 2;
            const idx = Math.floor((a / (Math.PI * 2)) * bins) % bins;
            hist[idx] += 1;
        }
        const smooth = new Float32Array(bins);
        const w = 5;
        for (let i = 0; i < bins; i++) {
            let s = 0;
            for (let k = -w; k <= w; k++) s += hist[(i + k + bins) % bins];
            smooth[i] = s / (2 * w + 1);
        }
        const thr = 0.5 * Math.max(...smooth);
        let peaks = 0;
        for (let i = 0; i < bins; i++) {
            const prev = smooth[(i - 1 + bins) % bins];
            const next = smooth[(i + 1) % bins];
            if (smooth[i] > thr && smooth[i] > prev && smooth[i] > next) peaks++;
        }

        let regions = 0;
        let inRegion = false;
        for (let i = 0; i < bins; i++) {
            const isPeak = smooth[i] > thr;
            if (isPeak && !inRegion) { inRegion = true; regions++; }
            else if (!isPeak && inRegion) { inRegion = false; }
        }

        return {
            present: true,
            center: { x: cx, y: cy },
            offset: { x: offsetX, y: offsetY },
            diameter: estDiameter,
            targetDiameter,
            diameterDeviation,
            spokeEstimate: regions,
            blueCount: bluePts.length,
            whiteBandHeight: whiteHeight,
        };
    }

    async function handleFiles(files) {
        const f = files?.[0];
        setReport(null);
        setError("");
        if (!f) return;
        if (!/(png|jpe?g|svg)$/i.test(f.name)) {
            setError("Please upload a PNG, JPG, or SVG file.");
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            setError("Max file size is 5MB.");
            return;
        }
        setFile(f);
        const url = await readFileAsDataURL(f);
        setImgUrl(url);
    }

    async function runValidation() {
        try {
            if (!imgUrl) return;
            setProcessing(true);

            const img = new Image();
            img.crossOrigin = "anonymous";
            const loaded = new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
            });
            img.src = imgUrl;
            await loaded;

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            const maxSide = 1600;
            let w = img.naturalWidth, h = img.naturalHeight;
            if (Math.max(w, h) > maxSide) {
                const scale = maxSide / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);

            const imgData = ctx.getImageData(0, 0, w, h);

            const actualAR = w / h;
            const arDeviation = Math.abs(actualAR - TARGET.aspectRatio) / TARGET.aspectRatio;
            const aspectStatus = arDeviation <= LIMITS.aspectTolerance ? "pass" : "fail";

            const stripes = classifyStripeHeights(imgData, w, h);
            const stripeStatus = (Math.abs(stripes.top - 1 / 3) <= 0.01 &&
                                                        Math.abs(stripes.middle - 1 / 3) <= 0.01 &&
                                                        Math.abs(stripes.bottom - 1 / 3) <= 0.01) ? "pass" : "fail";

            const yTopStart = 0, yTopEnd = stripes.boundaries.yTopEnd;
            const yMidStart = yTopEnd + 1, yMidEnd = stripes.boundaries.yMidEnd;
            const yBotStart = yMidEnd + 1, yBotEnd = h - 1;

            const avgTop = avgColorOfBand(imgData, w, yTopStart, yTopEnd);
            const avgMid = avgColorOfBand(imgData, w, yMidStart, yMidEnd);
            const avgBot = avgColorOfBand(imgData, w, yBotStart, yBotEnd);

            const devSaffron = colorDeviationPct(avgTop, TARGET.colors.saffron);
            const devWhite = colorDeviationPct(avgMid, TARGET.colors.white);
            const devGreen = colorDeviationPct(avgBot, TARGET.colors.green);

            const saffronOK = withinColorTolerance(avgTop, TARGET.colors.saffron);
            const whiteOK = withinColorTolerance(avgMid, TARGET.colors.white);
            const greenOK = withinColorTolerance(avgBot, TARGET.colors.green);

            const chakra = detectChakraMetrics(
                imgData, w, h,
                { y0: yMidStart, y1: yMidEnd }
            );

            const chakraReport = (() => {
                if (!chakra.present) {
                    return {
                        status: "fail",
                        reason: chakra.reason,
                        offset_x: "n/a",
                        offset_y: "n/a",
                        diameter_px: "n/a",
                        expected_diameter_px: ((0.75 * (yMidEnd - yMidStart + 1)) | 0).toString(),
                        diameter_deviation: "n/a",
                        spokes_detected: 0,
                    };
                }
                const posStatus = (Math.abs(chakra.offset.x) < 1 && Math.abs(chakra.offset.y) < 1) ? "pass" : "fail";
                const diaStatus = (chakra.diameterDeviation <= 0.02) ? "pass" : "fail";
                const spokeStatus = (Math.abs(chakra.spokeEstimate - 24) <= 1) ? "pass" : "fail";
                return {
                    status: (posStatus === "pass" && diaStatus === "pass" && spokeStatus === "pass") ? "pass" : "fail",
                    offset_x: `${chakra.offset.x.toFixed(0)}px`,
                    offset_y: `${chakra.offset.y.toFixed(0)}px`,
                    diameter_px: chakra.diameter.toFixed(0),
                    expected_diameter_px: chakra.targetDiameter.toFixed(0),
                    diameter_deviation: pct(chakra.diameterDeviation),
                    spokes_detected: chakra.spokeEstimate,
                    blue_pixels: chakra.blueCount,
                };
            })();

    const json = {
        aspect_ratio: { status: aspectStatus, actual: actualAR.toFixed(4) },
        colors: {
          saffron: { status: saffronOK ? "pass" : "fail", deviation: `${devSaffron.toFixed(1)}%` },
          white: { status: whiteOK ? "pass" : "fail", deviation: `${devWhite.toFixed(1)}%` },
          green: { status: greenOK ? "pass" : "fail", deviation: `${devGreen.toFixed(1)}%` },
          chakra_blue: (() => {
            if (!chakra.present) return { status: "fail", deviation: "n/a" };
            return { status: "pass", deviation: "~" };
          })(),
        },
        stripe_proportion: {
          status: stripeStatus,
          top: stripes.top.toFixed(2),
          middle: stripes.middle.toFixed(2),
          bottom: stripes.bottom.toFixed(2),
        },
        chakra_position: {
          status: chakraReport.status === "pass" ? "pass" : (chakraReport.status === "fail" ? "fail" : "fail"),
          offset_x: chakraReport.offset_x,
          offset_y: chakraReport.offset_y,
        },
        chakra_diameter: {
          status: chakraReport.status === "pass" ? "pass" : (chakraReport.status === "fail" ? "fail" : "fail"),
          actual_px: chakraReport.diameter_px,
          expected_px: chakraReport.expected_diameter_px,
          deviation: chakraReport.diameter_deviation,
        },
        chakra_spokes: {
          status: (chakra.present && Math.abs(chakra.spokeEstimate - 24) <= 2) ? "pass" : "fail",
          detected: chakra.present ? chakra.spokeEstimate : 0,
        },
    };

      setReport(json);
    } catch (e) {
      console.error(e);
      setError("Failed to process image. Make sure it is a flat, solid-color flag.");
    } finally {
      setProcessing(false);
    }
  }

  function downloadJSON() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flag_validation_report.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const dropHandlers = useMemo(() => ({
    onDragOver: (e) => { e.preventDefault(); },
    onDrop: (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); },
  }), []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">🇮🇳 Indian Flag Image Validator</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <section className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="text-lg font-semibold mb-2">Upload Flag Image</h2>
              <p className="text-sm text-gray-600 mb-3">PNG / JPG / SVG • ≤ 5MB • Flat, solid colors only</p>

              <div
                {...dropHandlers}
                className="border-2 border-dashed rounded-2xl p-6 text-center hover:border-blue-400 transition"
              >
                <input
                  id="file"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <label htmlFor="file" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 cursor-pointer">
                  <span className="i-lucide-upload" />
                  <span>Select file</span>
                </label>
                <p className="text-xs text-gray-500 mt-2">or drag & drop here</p>
              </div>

              {file && (
                <div className="mt-3 text-sm text-gray-700">
                  <div className="font-medium">Selected:</div>
                  <div className="truncate">{file.name} • {(file.size / 1024).toFixed(0)} KB</div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={runValidation}
                  disabled={!imgUrl || processing}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50 shadow hover:shadow-md"
                >
                  {processing ? "Validating..." : "Validate"}
                </button>
                <button
                  onClick={downloadJSON}
                  disabled={!report}
                  className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Download JSON
                </button>
              </div>

              {error && (
                <div className="mt-3 text-sm text-red-600">{error}</div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="text-lg font-semibold mb-2">BIS Rules Checked</h2>
              <ul className="text-sm list-disc pl-5 space-y-1 text-gray-700">
                <li>Aspect Ratio: 3:2 (±1%)</li>
                <li>Colors: Saffron #FF9933, White #FFFFFF, Green #138808, Chakra #000080 (±5% per channel)</li>
                <li>Stripes: each ≈ 1/3 of height</li>
                <li>Chakra: diameter ≈ 3/4 of white band height, centered, 24 spokes</li>
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="text-lg font-semibold mb-3">Preview</h2>
              <div className="aspect-video w-full bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center">
                {imgUrl ? (
                  // The canvas used for analysis doubles as the preview
                  <canvas ref={canvasRef} className="w-full h-full object-contain" />
                ) : (
                  <div className="text-sm text-gray-500">No image yet</div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="text-lg font-semibold mb-2">Validation Report (JSON)</h2>
              <pre className="text-xs bg-gray-50 rounded-xl p-3 overflow-auto max-h-80 border">
                {report ? JSON.stringify(report, null, 2) : "Run validation to see results..."}
              </pre>
            </div>
          </div>
        </section>

        <section className="mt-8 p-4 rounded-2xl bg-white shadow-sm border">
          <h2 className="text-lg font-semibold mb-2">How to Use</h2>
          <ol className="list-decimal pl-5 text-sm space-y-1 text-gray-700">
            <li>Click <span className="px-1 py-0.5 border rounded">Select file</span> and choose a PNG/JPG/SVG (≤ 5MB).</li>
            <li>Press <span className="px-1 py-0.5 border rounded">Validate</span>.</li>
            <li>Review the JSON report and optionally <span className="px-1 py-0.5 border rounded">Download JSON</span>.</li>
          </ol>
          <p className="text-xs text-gray-500 mt-3">Note: This demo expects flat, solid colors (no folds, shadows, textures).</p>
        </section>

        <footer className="py-8 text-center text-xs text-gray-500">© {new Date().getFullYear()} Indian Flag Validator</footer>
      </main>
    </div>
  );
}
