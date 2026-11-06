import * as fs from "node:fs";
import { hasFsCode, isEexist, isEnoent, logger, toError } from "@oh-my-pi/pi-utils";

/**
 * Publish a staged sibling file atomically, preserving an existing destination
 * across Windows `EPERM`/`EEXIST` replacement failures.
 */
export async function replaceFileAtomically(tempPath: string, targetPath: string): Promise<void> {
	try {
		await fs.promises.rename(tempPath, targetPath);
		return;
	} catch (error) {
		if (!hasFsCode(error, "EPERM") && !isEexist(error)) throw error;
		await replaceAfterWindowsRenameFailure(tempPath, targetPath, error);
	}
}

async function replaceAfterWindowsRenameFailure(
	tempPath: string,
	targetPath: string,
	renameError: unknown,
): Promise<void> {
	const backupPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.bak`;
	try {
		await fs.promises.rename(targetPath, backupPath);
	} catch (error) {
		if (isEnoent(error)) {
			await fs.promises.rename(tempPath, targetPath);
			return;
		}
		throw renameError;
	}

	try {
		await fs.promises.rename(tempPath, targetPath);
	} catch (replaceError) {
		try {
			await fs.promises.rename(backupPath, targetPath);
		} catch (rollbackError) {
			throw new Error(
				`Failed to replace file after ${toError(renameError).message} (retry: ${
					toError(replaceError).message
				}; rollback: ${toError(rollbackError).message})`,
				{ cause: toError(renameError) },
			);
		}
		throw replaceError;
	}

	try {
		await fs.promises.rm(backupPath);
	} catch (error) {
		if (!isEnoent(error)) {
			logger.warn("Failed to remove atomic replacement backup", {
				path: targetPath,
				backupPath,
				error: toError(error).message,
			});
		}
	}
}

export interface AtomicFileWriteOptions {
	/** False uses no-overwrite publication, even if a destination appears while staging. */
	readonly replace?: boolean;
	/** Runs after the staged file is flushed and before publication. Not a filesystem CAS. */
	readonly beforePublish?: () => Promise<void>;
}

/**
 * Write through a private temp sibling, then publish complete contents in one
 * filesystem operation. Failures before publication leave the destination untouched.
 *
 * The staged file is created with `mode` (0600 by default) and published with
 * that mode, so the destination stays readable only by its owner even when it
 * carries a secret.
 */
export async function writeFileAtomically(
	filePath: string,
	content: string,
	mode: number = 0o600,
	options?: AtomicFileWriteOptions,
): Promise<void> {
	const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
	let removeTemp = false;
	try {
		const handle = await fs.promises.open(tempPath, "wx", mode);
		removeTemp = true;
		try {
			await handle.writeFile(content, "utf8");
			await handle.sync();
		} finally {
			await handle.close();
		}
		// The umask narrows the mode passed to open(); restore it explicitly.
		await fs.promises.chmod(tempPath, mode);
		if (options?.beforePublish) await options.beforePublish();
		if (options?.replace === false) {
			await fs.promises.link(tempPath, filePath);
			await fs.promises.unlink(tempPath);
		} else {
			await replaceFileAtomically(tempPath, filePath);
		}
		removeTemp = false;
	} finally {
		if (removeTemp) {
			await fs.promises.rm(tempPath, { force: true }).catch(() => {});
		}
	}
}

/**
 * Synchronous sibling of {@link writeFileAtomically} for callers that cannot
 * await, such as the boot-time config migration.
 */
export function writeFileAtomicallySync(filePath: string, content: string, mode: number = 0o600): void {
	const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
	let fd: number | undefined;
	try {
		fd = fs.openSync(tempPath, "wx", mode);
		fs.writeFileSync(fd, content, "utf8");
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		fd = undefined;
		// The umask narrows the mode passed to open(); restore it explicitly.
		fs.chmodSync(tempPath, mode);
		fs.renameSync(tempPath, filePath);
	} catch (error) {
		if (fd !== undefined) {
			try {
				fs.closeSync(fd);
			} catch {
				// The descriptor is already gone.
			}
		}
		fs.rmSync(tempPath, { force: true });
		throw error;
	}
}

/**
 * Flush a staged file and publish a hard link without replacing an existing
 * destination. Both names are retained. The caller owns the open handle, must
 * keep the staging path bound to it, and handles cleanup and directory fsync.
 */
export async function publishFileWithoutReplacement(
	staging: string,
	destination: string,
	handle: fs.promises.FileHandle,
): Promise<void> {
	await handle.sync();
	await fs.promises.link(staging, destination);
}

/** Synchronous publication for live-file moves that must remove the source without yielding. */
export function publishFileWithoutReplacementSync(staging: string, destination: string): void {
	const fd = fs.openSync(staging, "r+");
	try {
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
	fs.linkSync(staging, destination);
}

/**
 * Move a live file across devices without exposing a partial destination.
 * The source remains authoritative while the copy is staged. Publication and
 * source removal are synchronous so in-process writers cannot land between them.
 */
export async function moveFileAcrossDevices(source: string, destination: string): Promise<void> {
	const staging = `${destination}.${process.pid}.${crypto.randomUUID()}.move`;
	try {
		for (;;) {
			const before = fs.statSync(source, { bigint: true });
			await fs.promises.copyFile(source, staging);
			const after = fs.statSync(source, { bigint: true });
			if (before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) continue;
			// Flush the completed copy before making it discoverable. Neither the
			// temporary copy nor an existing destination is ever a live write target.
			publishFileWithoutReplacementSync(staging, destination);
			try {
				fs.unlinkSync(source);
			} catch (error) {
				fs.unlinkSync(destination);
				throw error;
			}
			return;
		}
	} finally {
		await fs.promises.unlink(staging).catch(error => {
			if (!isEnoent(error))
				logger.warn("Failed to remove staged move copy", { staging, error: toError(error).message });
		});
	}
}

/**
 * Move a finished file across devices, replacing a same-named destination. The copy is staged beside the destination
 * and published in one rename, so a failure before publication leaves the destination as it was. Once published, a
 * source that cannot be removed is logged rather than failing the move.
 */
export async function replaceFileAcrossDevices(source: string, destination: string): Promise<void> {
	const staging = `${destination}.${process.pid}.${crypto.randomUUID()}.move`;
	try {
		await fs.promises.copyFile(source, staging);
		const fd = fs.openSync(staging, "r+");
		try {
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		await replaceFileAtomically(staging, destination);
	} catch (error) {
		await fs.promises.rm(staging, { force: true });
		throw error;
	}
	await fs.promises.unlink(source).catch(error => {
		logger.warn("Failed to remove moved file's source", { source, error: toError(error).message });
	});
}
