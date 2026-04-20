import { spawn } from "node:child_process";

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code ?? "unknown"}.`));
    });

    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  await runCommand("npm", ["run", "sim", "--", ...args]);
  await runCommand("npm", ["run", "ml:export", "--", "--phase", "play"]);
  await runCommand("npm", ["run", "ml:train", "--", "--phase", "play"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
