// Anki Image Occlusion canvas renderer.
// Loaded inside blob-URL iframes by renderCardInFrame().
// Reads the hidden data-* elements and paints rectangles on the IO canvas.

(function renderOcclusions() {
  const img = document.querySelector("#image-occlusion-container img");
  const canvas = document.getElementById("image-occlusion-canvas");
  if (!img || !canvas) return;

  function draw() {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) { img.addEventListener("load", draw, { once: true }); return; }

    // Size the canvas to the image's natural pixels
    canvas.width = w;
    canvas.height = h;

    // Position canvas over the image
    const container = document.getElementById("image-occlusion-container");
    if (container) {
      container.style.position = "relative";
      container.style.display  = "inline-block";
      container.style.maxWidth = "100%";
    }
    const imgEl = container && container.querySelector("img");
    if (imgEl) { imgEl.style.display = "block"; imgEl.style.maxWidth = "100%"; }

    canvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;";

    const ctx = canvas.getContext("2d");

    // Inactive occlusions (other cards) — draw gray if data-occludeinactive="1"
    document.querySelectorAll(".cloze-inactive").forEach(el => {
      if (el.dataset.occludeinactive !== "1") return;
      paintRect(ctx, el, "rgba(100,100,100,0.85)", w, h);
    });

    // Active occlusion (the card being tested) — draw blue
    document.querySelectorAll(".cloze").forEach(el => {
      paintRect(ctx, el, "rgba(30,144,255,0.85)", w, h);
    });
  }

  if (img.complete && img.naturalWidth) draw();
  else img.addEventListener("load", draw, { once: true });
})();

function paintRect(ctx, el, color, imgW, imgH) {
  const left   = parseFloat(el.dataset.left)   * imgW;
  const top    = parseFloat(el.dataset.top)    * imgH;
  const width  = parseFloat(el.dataset.width)  * imgW;
  const height = parseFloat(el.dataset.height) * imgH;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
}
