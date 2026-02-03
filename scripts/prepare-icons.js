const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const source = path.join(__dirname, "..", "assets", "Vibeflow4X.png");
const outputDir = path.join(__dirname, "..", "build");
const output = path.join(outputDir, "icon.png");

async function run() {
  await fs.promises.mkdir(outputDir, { recursive: true });
  await sharp(source)
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 10, g: 10, b: 10, alpha: 0 }
    })
    .png()
    .toFile(output);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
