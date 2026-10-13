// Tiny, dependency-free WASM helper for the visual canvas.
// Integer snap/clamp calculations only; no network, imports, or personal data.
__attribute__((export_name("snap")))
int snap(int n, int step) {
  if (step <= 1) return n;
  if (n < 0) return -(((-n + step/2)/step)*step);
  return ((n + step/2)/step)*step;
}
__attribute__((export_name("clamp_pos")))
int clamp_pos(int n, int low, int high) {
  return n < low ? low : (n > high ? high : n);
}
