import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SQL, YAML, type ReservedSQL } from "bun";
import { withFileLock } from "@oh-my-pi/pi-utils/file-lock";
import { isEexist, isEnoent } from "@oh-my-pi/pi-utils/fs-error";
import { isRecord } from "@oh-my-pi/pi-utils/type-guards";
import { ownerPrivateDirError } from "@oh-my-pi/pi-coding-agent/utils/owner-private-dir";
import { checkpointHash, uuid } from "./record-sql";

export interface HuntRuntime {
	readonly projectRoot: string;
	readonly huntRoot: string;
	readonly serverRoot: string;
	readonly databaseRoot: string;
	readonly engagementsRoot: string;
	readonly schemaDirectory: string;
	readonly host: "127.0.0.1";
	readonly port: number;
}
export interface HuntConnection {
	readonly runtime: HuntRuntime;
	readonly sql: ReservedSQL;
	readonly engagementId: string;
	readonly database: string;
	readonly engagementRoot: string;
	readonly connectionId: string;
	readonly lockName: string;
	readonly signal?: AbortSignal;
}
export interface RootState {
	readonly head: string;
	readonly headRoot: string;
	readonly working: string;
	readonly staged: string;
}
export class HuntRuntimeError extends Error {
	constructor(
		readonly code: "runtime_unavailable" | "runtime_mismatch" | "writer_busy" | "unsafe_path" | "lost_fence",
		message: string,
	) {
		super(message);
		this.name = "HuntRuntimeError";
	}
}
export class SqlTransactionError extends Error {
	constructor(
		readonly outcome: "rolled_back" | "uncertain",
		cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
		this.name = "SqlTransactionError";
	}
}

/** Inspect the opened inode; never normalize existing permissions or follow a final symlink. */
export async function assertPrivateDirectory(directory: string): Promise<void> {
	const handle = await fs.open(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_DIRECTORY);
	try {
		const stat = await handle.stat();
		const reason = ownerPrivateDirError(
			{ isSymlink: false, isDir: stat.isDirectory(), uid: stat.uid, mode: stat.mode },
			process.getuid?.(),
		);
		if (reason) throw new HuntRuntimeError("unsafe_path", `Private hunt directory ${reason}`);
	} finally {
		await handle.close();
	}
}
export async function readPrivateText(file: string): Promise<string> {
	const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
	try {
		const stat = await handle.stat();
		if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid()))
			throw new HuntRuntimeError(
				"unsafe_path",
				"Hunt runtime file must be an owner-private regular file with mode 0600",
			);
		return await Bun.file(handle.fd).text();
	} finally {
		await handle.close();
	}
}
export async function loadHuntRuntime(): Promise<HuntRuntime> {
	if (process.platform !== "linux" || Bun.version !== "1.4.4")
		throw new HuntRuntimeError(
			"runtime_mismatch",
			"This hunt runtime requires Linux, Bun 1.4.4, and Dolt 2.6.2; upgrades need a SQL compatibility check",
		);
	const projectRoot = await fs.realpath(path.resolve(import.meta.dir, "../../.."));
	const huntRoot = path.join(projectRoot, ".omp/hunts");
	if ((await fs.realpath(huntRoot)) !== huntRoot)
		throw new HuntRuntimeError("unsafe_path", "Hunt data must remain in the canonical checkout-local directory");
	const serverRoot = path.join(huntRoot, "server");
	const databaseRoot = path.join(huntRoot, "databases");
	for (const directory of [huntRoot, serverRoot, databaseRoot]) await assertPrivateDirectory(directory);
	const config: unknown = YAML.parse(await readPrivateText(path.join(serverRoot, "config.yaml")));
	if (
		!isRecord(config) ||
		!isRecord(config.listener) ||
		config.listener.host !== "127.0.0.1" ||
		!Number.isInteger(config.listener.port) ||
		Number(config.listener.port) < 1 ||
		Number(config.listener.port) > 65535
	)
		throw new HuntRuntimeError(
			"runtime_mismatch",
			"Expected the approved loopback Dolt listener in .omp/hunts/server/config.yaml",
		);
	return {
		projectRoot,
		huntRoot,
		serverRoot,
		databaseRoot,
		engagementsRoot: path.join(huntRoot, "engagements"),
		schemaDirectory: path.join(projectRoot, ".omp/tools/hunt/schema"),
		host: "127.0.0.1",
		port: Number(config.listener.port),
	};
}
export function engagementDatabase(engagementId: string): string {
	return `hunt_${uuid(engagementId).replaceAll("-", "")}`;
}
export async function ensureEngagementDirectories(runtime: HuntRuntime, engagementId: string): Promise<string> {
	const root = path.join(runtime.engagementsRoot, uuid(engagementId));
	for (const directory of [
		runtime.engagementsRoot,
		root,
		path.join(root, "artifacts"),
		path.join(root, "artifacts/sha256"),
		path.join(root, "scripts"),
		path.join(root, "exports"),
		path.join(root, "work"),
	]) {
		try {
			await fs.mkdir(directory, { mode: 0o700 });
		} catch (error) {
			if (!isEexist(error)) throw error;
		}
		await assertPrivateDirectory(directory);
		if ((await fs.realpath(directory)) !== directory)
			throw new HuntRuntimeError("unsafe_path", "Engagement directory must not redirect outside its canonical path");
	}
	return root;
}
export async function assertConnectionFence(connection: HuntConnection): Promise<void> {
	const [row] = await connection.sql.unsafe<{ connection_id: string; owner_id: string | null }[]>(
		"SELECT CAST(CONNECTION_ID() AS CHAR) AS connection_id, CAST(IS_USED_LOCK(?) AS CHAR) AS owner_id",
		[connection.lockName],
	);
	if (row?.connection_id !== connection.connectionId || row.owner_id !== connection.connectionId)
		throw new HuntRuntimeError("lost_fence", "Reserved SQL connection no longer owns the engagement lease");
}

/** One managed local server; callers stop and await that server before replacing it. */
export async function withEngagementConnection<T>(
	engagementId: string,
	callback: (connection: HuntConnection) => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	uuid(engagementId);
	const runtime = await loadHuntRuntime();
	return withFileLock(
		path.join(runtime.serverRoot, `engagement-${engagementId}`),
		async () => {
			signal?.throwIfAborted();
			const password = await readPrivateText(path.join(runtime.serverRoot, "password"));
			if (password.length === 0)
				throw new HuntRuntimeError("runtime_unavailable", "The private Dolt password file is empty");
			const client = new SQL({
				adapter: "mysql",
				hostname: runtime.host,
				port: runtime.port,
				username: "root",
				password,
				database: "mysql",
				max: 1,
				connectionTimeout: 5,
			});
			let sql: ReservedSQL | undefined;
			try {
				sql = await client.reserve({ signal });
				const [identity] = await sql.unsafe<{ connection_id: string; version: string }[]>(
					"SELECT CAST(CONNECTION_ID() AS CHAR) AS connection_id, DOLT_VERSION() AS version",
				);
				if (!identity || identity.version !== "2.6.2")
					throw new HuntRuntimeError("runtime_mismatch", "Expected Dolt 2.6.2");
				const lockName = `omp-hunt:${engagementId}`;
				const [lease] = await sql.unsafe<{ acquired: number | null }[]>("SELECT GET_LOCK(?, 0) AS acquired", [
					lockName,
				]);
				if (lease?.acquired !== 1)
					throw new HuntRuntimeError(
						"writer_busy",
						"Another SQL connection still owns this engagement; no operation was dispatched",
					);
				await sql.unsafe(
					"SET SESSION autocommit = 1, dolt_transaction_commit = 0, time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
				);
				signal?.throwIfAborted();
				return await callback({
					runtime,
					sql,
					engagementId,
					database: engagementDatabase(engagementId),
					engagementRoot: path.join(runtime.engagementsRoot, engagementId),
					connectionId: identity.connection_id,
					lockName,
					signal,
				});
			} catch (error) {
				if (isEnoent(error))
					throw new HuntRuntimeError(
						"runtime_unavailable",
						"Private runtime files are missing; start the checkout-local Dolt server before using hunt records",
					);
				throw error;
			} finally {
				// All admitted queries are awaited. Server teardown releases this native
				// lease only after its ordinary non-cursor query handler has settled.
				sql?.release();
				await client.close({ timeout: 0 });
			}
		},
		{ signal },
	);
}
export async function selectEngagement(connection: HuntConnection): Promise<void> {
	await assertConnectionFence(connection);
	await connection.sql.unsafe(`USE \`${connection.database}/main\``);
	const [row] = await connection.sql.unsafe<
		{ database_name: string; branch_name: string; autocommit: number; transaction_commit: number }[]
	>(
		"SELECT DATABASE() AS database_name, ACTIVE_BRANCH() AS branch_name, @@autocommit AS autocommit, @@dolt_transaction_commit AS transaction_commit",
	);
	if (
		row?.database_name !== `${connection.database}/main` ||
		row.branch_name !== "main" ||
		Number(row.autocommit) !== 1 ||
		Number(row.transaction_commit) !== 0
	)
		throw new HuntRuntimeError("lost_fence", "SQL session did not select the explicit engagement main working set");
}
export async function readRoots(connection: HuntConnection): Promise<RootState> {
	const [row] = await connection.sql.unsafe<RootState[]>(
		"SELECT DOLT_HASHOF('HEAD') AS head, DOLT_HASHOF_DB('HEAD') AS headRoot, DOLT_HASHOF_DB('WORKING') AS working, DOLT_HASHOF_DB('STAGED') AS staged",
	);
	if (!row) throw new HuntRuntimeError("runtime_unavailable", "Dolt roots are unavailable");
	for (const value of [row.head, row.headRoot, row.working, row.staged]) checkpointHash(value);
	return row;
}
export async function sqlTransaction<T>(connection: HuntConnection, apply: () => Promise<T>): Promise<T> {
	await assertConnectionFence(connection);
	await connection.sql.unsafe("START TRANSACTION");
	let committing = false;
	try {
		const result = await apply();
		await assertConnectionFence(connection);
		committing = true;
		await connection.sql.unsafe("COMMIT");
		return result;
	} catch (error) {
		if (committing) throw new SqlTransactionError("uncertain", error);
		try {
			await connection.sql.unsafe("ROLLBACK");
			await assertConnectionFence(connection);
		} catch (rollbackError) {
			throw new SqlTransactionError(
				"uncertain",
				new AggregateError([error, rollbackError], "SQL rejection could not be confirmed rolled back"),
			);
		}
		throw new SqlTransactionError("rolled_back", error);
	}
}
