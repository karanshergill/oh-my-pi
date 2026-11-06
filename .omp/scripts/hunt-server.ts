import * as fs from "node:fs/promises";
import * as path from "node:path";

const projectRoot = await fs.realpath(path.resolve(import.meta.dir, "../.."));
const huntRoot = path.join(projectRoot, ".omp/hunts");
const serverRoot = path.join(huntRoot, "server");
const home = path.join(serverRoot, "home");
const password = await Bun.file(path.join(serverRoot, "password")).text();
if (password.length === 0) throw new Error("The private Dolt password file is empty; refusing to start.");

process.umask(0o077);
const child = Bun.spawn(
	[path.join(projectRoot, ".omp/runtime/dolt/bin/dolt"), "sql-server", "--config", path.join(serverRoot, "config.yaml")],
	{
		cwd: serverRoot,
		stdin: "ignore",
		stdout: "inherit",
		stderr: "inherit",
		env: {
			PATH: Bun.env.PATH ?? "/usr/bin:/bin",
			HOME: home,
			DOLT_ROOT_PATH: home,
			TMPDIR: path.join(serverRoot, "tmp"),
			LC_ALL: "C",
			TZ: "UTC",
			DOLT_ROOT_HOST: "localhost",
			DOLT_ROOT_PASSWORD: password,
			OMP_HUNT_DATA_DIR: JSON.stringify(path.join(huntRoot, "databases")),
			OMP_HUNT_SERVER_DIR: JSON.stringify(serverRoot),
			OMP_HUNT_PRIVILEGE_FILE: JSON.stringify(path.join(serverRoot, "privileges.db")),
			OMP_HUNT_BRANCH_CONTROL_FILE: JSON.stringify(path.join(serverRoot, "branch_control.db")),
		},
	},
);

const signals = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
const stop = () => {
	if (child.exitCode === null) child.kill("SIGTERM");
};
for (const signal of signals) process.on(signal, stop);
try {
	process.exitCode = await child.exited;
} finally {
	for (const signal of signals) process.off(signal, stop);
}
