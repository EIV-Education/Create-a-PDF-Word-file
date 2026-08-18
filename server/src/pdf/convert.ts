import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export class PdfConversionError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "PdfConversionError";
  }
}

/**
 * Converts a .docx buffer to PDF using headless LibreOffice
 * (`soffice --headless --convert-to pdf`). Each call gets its own temp
 * directory/user-profile so concurrent conversions don't collide.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "docgen-pdf-"));
  const userInstallDir = path.join(workDir, "lo-profile");
  const inputPath = path.join(workDir, "input.docx");

  try {
    await fs.writeFile(inputPath, docxBuffer);

    await runSoffice([
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      `-env:UserInstallation=file://${userInstallDir}`,
      "--convert-to",
      "pdf",
      "--outdir",
      workDir,
      inputPath,
    ]);

    const outputPath = path.join(workDir, "input.pdf");
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runSoffice(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.pdf.sofficeBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new PdfConversionError(`LibreOffice conversion timed out after ${config.pdf.timeoutMs}ms`, stderr));
    }, config.pdf.timeoutMs);

    child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    child.stdout?.on("data", (chunk) => (stdout += String(chunk)));

    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new PdfConversionError(
            `Could not find "${config.pdf.sofficeBin}". Install LibreOffice or set SOFFICE_BIN to its path.`
          )
        );
      } else {
        reject(new PdfConversionError(err.message, stderr));
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new PdfConversionError(`soffice exited with code ${code}: ${stdout}\n${stderr}`, stderr));
      }
    });
  });
}

/** Quick capability check the /api/settings status endpoint can surface. */
export async function isPdfConversionAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(config.pdf.sofficeBin, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

// Unique id helper reused by callers that need a scratch filename; kept
// here so pdf/ doesn't need an extra util import for one-off temp names.
export function tempName(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
