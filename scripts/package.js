// scripts/package.js — Package the extension into a distributable .zip
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const srcDir = path.resolve(__dirname, "..", "src");
const distDir = path.resolve(__dirname, "..", "dist");
const outFile = path.join(distDir, "flightdeck.zip");

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

const output = fs.createWriteStream(outFile);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  const sizeKB = (archive.pointer() / 1024).toFixed(1);
  console.log(`✔ Packaged ${sizeKB} KB → dist/flightdeck.zip`);
});

archive.on("error", (err) => { throw err; });

archive.pipe(output);
archive.directory(srcDir, false);
archive.finalize();
