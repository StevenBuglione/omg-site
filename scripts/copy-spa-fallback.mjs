import { copyFile } from "node:fs/promises";

await copyFile("build/index.html", "build/404.html");
