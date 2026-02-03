const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  sourcemap: true
};

const builds = [
  {
    entryPoints: ["app/main.ts"],
    outfile: "dist/main.js",
    platform: "node",
    target: "node18",
    external: ["electron", "node-pty"]
  },
  {
    entryPoints: ["app/preload.ts"],
    outfile: "dist/preload.js",
    platform: "node",
    target: "node18",
    external: ["electron"]
  },
  {
    entryPoints: ["ui/src/renderer.ts"],
    outfile: "ui/dist/renderer.js",
    platform: "browser",
    target: "es2020",
    format: "esm",
    loader: {
      ".css": "css"
    }
  }
];

async function run() {
  if (watch) {
    for (const options of builds) {
      const ctx = await esbuild.context({ ...shared, ...options });
      await ctx.watch();
    }
    console.log("watching for changes...");
    return;
  }

  await Promise.all(builds.map((options) => esbuild.build({ ...shared, ...options })));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
