autowatch = 1;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var bannerLines = [
  "             ,---.       .=-.-.       ,-.-.    ,----.  ",
  "   _.-.    .--.'  \\\\     /==/_ /,--.-./=/ ,/ ,-.--` , \\\\ ",
  " .-,.'|    \\\\==\\\\-/\\\\\\\\ \\\\   |==|, |/==/, ||=| -||==|-  _.-` ",
  "|==|, |    /==/-|_\\\\ |  |==|  |\\\\==\\\\,  \\\\ / ,||==|   `.-. ",
  "|==|- |    \\\\==\\\\,   - \\\\ |==|- | \\\\==\\\\ - ' - /==/_ ,    / ",
  "|==|, |    /==/ -   ,| |==| ,|  \\\\==\\\\ ,   ||==|    .-'  ",
  "|==|- `-._/==/-  /\\\\ - \\\\|==|- |  |==| -  ,/|==|_  ,`-._ ",
  "/==/ - , ,|==\\\\ _.\\\\=\\\\.-'/==/. /  \\\\==\\\\  _ / /==/ ,     / ",
  "`--`-----' `--`        `--`-`    `--`--'  `--`-----``  "
];

var lineColors = [
  [0.12, 0.84, 0.97, 1.0],
  [0.48, 0.62, 1.0, 1.0],
  [0.73, 0.35, 0.98, 1.0],
  [0.98, 0.42, 0.38, 1.0],
  [0.99, 0.74, 0.14, 1.0],
  [0.60, 0.92, 0.18, 1.0]
];
var logoImage = null;
var logoLoadAttempted = 0;

function paint() {
  var size = mgraphics.size;
  var width = size[0];
  var height = size[1];

  drawBackground(width, height);
  drawBorder(width, height);
  if (!drawLogoImage(width, height)) {
    drawAsciiBanner();
  }
}

function drawBackground(width, height) {
  mgraphics.set_source_rgba(0.047, 0.055, 0.082, 1.0);
  roundedRect(0, 0, width, height, 14);
  mgraphics.fill();
}

function drawBorder(width, height) {
  mgraphics.set_source_rgba(0.21, 0.24, 0.31, 1.0);
  roundedRect(0.5, 0.5, width - 1, height - 1, 14);
  mgraphics.set_line_width(1.0);
  mgraphics.stroke();
}

function drawLogoImage(width, height) {
  var image = getLogoImage();
  var availableWidth;
  var availableHeight;
  var scale;
  var drawWidth;
  var drawHeight;
  var x;
  var y;

  if (!image || !image.size || image.size[0] <= 0 || image.size[1] <= 0) {
    return false;
  }

  availableWidth = width - 28;
  availableHeight = height - 22;
  scale = Math.min(availableWidth / image.size[0], availableHeight / image.size[1]);
  drawWidth = image.size[0] * scale;
  drawHeight = image.size[1] * scale;
  x = (width - drawWidth) / 2;
  y = (height - drawHeight) / 2;

  mgraphics.save();
  mgraphics.translate(x, y);
  mgraphics.scale(scale, scale);
  mgraphics.image_surface_draw(image);
  mgraphics.restore();
  return true;
}

function drawAsciiBanner() {
  var x = 14;
  var y = 16;
  var lineHeight = 8.6;
  var i;

  mgraphics.select_font_face("Monaco");
  mgraphics.set_font_size(8.6);

  for (i = 0; i < bannerLines.length; i += 1) {
    var color = lineColors[i % lineColors.length];
    mgraphics.set_source_rgba(color[0], color[1], color[2], color[3]);
    mgraphics.move_to(x, y + i * lineHeight);
    mgraphics.show_text(bannerLines[i]);
  }
}

function getLogoImage() {
  var candidates;
  var i;

  if (logoLoadAttempted) {
    return logoImage;
  }

  logoLoadAttempted = 1;
  candidates = ["logo.png", "../assets/logo.png"];

  for (i = 0; i < candidates.length; i += 1) {
    try {
      logoImage = new Image(candidates[i]);
      if (logoImage && logoImage.size && logoImage.size[0] > 0 && logoImage.size[1] > 0) {
        return logoImage;
      }
    } catch (error) {
      logoImage = null;
    }
  }

  return null;
}

function roundedRect(x, y, width, height, radius) {
  if (typeof mgraphics.rectangle_rounded === "function") {
    mgraphics.rectangle_rounded(x, y, width, height, radius, radius);
    return;
  }

  mgraphics.rectangle(x, y, width, height);
}

function onresize() {
  mgraphics.redraw();
}
