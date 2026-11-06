import type * as nodeFs from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { publishFileWithoutReplacement } from "@oh-my-pi/pi-coding-agent/utils/atomic-file";
import { sha256File } from "@oh-my-pi/pi-coding-agent/utils/file-hash";
import { isEexist, isEnoent } from "@oh-my-pi/pi-utils/fs-error";
import { verifyPreservedArtifact } from "./record-artifacts";
import { requireCondition, uint } from "./record-sql";
import { assertPrivateDirectory } from "./runtime";

export interface PreservedArtifactFile {
	readonly relativePath: string;
	readonly sha256: string;
	readonly byteCount: string;
}
export interface ExpectedArtifactFile {
	readonly sha256?: string;
	readonly byteCount?: string;
}

function sameInode(before: nodeFs.BigIntStats, after: nodeFs.BigIntStats): boolean {
	return before.dev === after.dev && before.ino === after.ino;
}

function sameFileState(before: nodeFs.BigIntStats, after: nodeFs.BigIntStats): boolean {
	return (
		before.isFile() &&
		after.isFile() &&
		sameInode(before, after) &&
		before.size === after.size &&
		before.mtimeNs === after.mtimeNs &&
		before.ctimeNs === after.ctimeNs
	);
}

function requirePrivateFile(stat: nodeFs.BigIntStats): void {
	const uid = process.getuid?.();
	requireCondition(
		stat.isFile() && (stat.mode & 0o777n) === 0o600n && (uid === undefined || stat.uid === BigInt(uid)),
		"Preserved artifact must be an owner-private regular file with mode 0600",
	);
}

/** Caller holds the engagement locks; publication never replaces or removes an artifact. */
export async function preserveArtifactFile(
	engagementRoot: string,
	sourcePath: string,
	expected?: ExpectedArtifactFile,
	signal?: AbortSignal,
): Promise<PreservedArtifactFile> {
	signal?.throwIfAborted();
	requireCondition(
		typeof engagementRoot === "string" &&
			path.isAbsolute(engagementRoot) &&
			path.resolve(engagementRoot) === engagementRoot &&
			(await fs.realpath(engagementRoot)) === engagementRoot,
		"Engagement root must be explicit, absolute and canonical",
	);
	requireCondition(
		typeof sourcePath === "string" && path.isAbsolute(sourcePath) && !sourcePath.includes("\0"),
		"Artifact source must be an explicit absolute local path",
	);
	if (expected?.sha256 !== undefined)
		requireCondition(
			typeof expected.sha256 === "string" && /^[0-9a-f]{64}$/.test(expected.sha256),
			"Invalid captured artifact SHA-256",
		);
	if (expected?.byteCount !== undefined) {
		requireCondition(typeof expected.byteCount === "string", "Captured byte count must be an exact decimal string");
		uint(expected.byteCount);
	}

	const artifactDirectory = path.join(engagementRoot, "artifacts/sha256");
	for (const directory of [engagementRoot, path.join(engagementRoot, "artifacts"), artifactDirectory]) {
		await assertPrivateDirectory(directory);
		requireCondition((await fs.realpath(directory)) === directory, "Artifact directory must not include a symlink");
	}

	const resolvedSource = await fs.realpath(sourcePath);
	const selected = await fs.lstat(resolvedSource, { bigint: true });
	requireCondition(selected.isFile(), "Artifact source must be a regular file");
	// NONBLOCK also protects the lstat/open race if a FIFO replaces the selected inode.
	const source = await fs.open(
		resolvedSource,
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
	);
	try {
		const before = await source.stat({ bigint: true });
		requireCondition(sameFileState(selected, before), "Artifact source changed before it could be opened");
		const byteCount = uint(before.size.toString());
		signal?.throwIfAborted();
		const directory = await fs.open(
			artifactDirectory,
			fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_DIRECTORY,
		);
		try {
			const temporaryPath = path.join(artifactDirectory, `.preserve-${process.pid}-${crypto.randomUUID()}.tmp`);
			const temporary = await fs.open(
				temporaryPath,
				fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
				0o600,
			);
			let owned: nodeFs.BigIntStats | undefined;
			let result: PreservedArtifactFile | undefined;
			let failure: { error: unknown } | undefined;
			try {
				owned = await temporary.stat({ bigint: true });
				// Only this newly created inode may have permissions restored after umask.
				await temporary.chmod(0o600);
				requirePrivateFile(await temporary.stat({ bigint: true }));
				// Both BunFiles wrap pinned descriptors: copying never reopens the source pathname.
				const copied = await Bun.write(Bun.file(temporary.fd), Bun.file(source.fd));
				requireCondition(
					Number.isSafeInteger(copied) && copied >= 0 && BigInt(copied) === before.size,
					"Copied artifact byte count does not match the selected source",
				);
				requireCondition(
					sameFileState(before, await source.stat({ bigint: true })),
					"Artifact source changed during copying",
				);
				const staged = await temporary.stat({ bigint: true });
				requirePrivateFile(staged);
				requireCondition(
					sameInode(owned, staged) && staged.size === before.size,
					"Staged artifact has an unexpected identity or size",
				);
				requireCondition(
					sameFileState(staged, await fs.lstat(temporaryPath, { bigint: true })),
					"Staged artifact pathname no longer identifies the owned file",
				);
				signal?.throwIfAborted();
				const sha256 = await sha256File(temporaryPath);
				requireCondition(
					sameFileState(staged, await temporary.stat({ bigint: true })) &&
						sameFileState(staged, await fs.lstat(temporaryPath, { bigint: true })),
					"Staged artifact changed during hashing",
				);
				requireCondition(
					(expected?.sha256 === undefined || sha256 === expected.sha256) &&
						(expected?.byteCount === undefined || byteCount === expected.byteCount),
					"Preserved bytes do not match the captured artifact identity",
				);
				requireCondition(
					sameFileState(before, await source.stat({ bigint: true })),
					"Artifact source changed before publication",
				);
				signal?.throwIfAborted();
				const relativePath = `artifacts/sha256/${sha256}`;
				const destination = path.join(engagementRoot, relativePath);
				try {
					await publishFileWithoutReplacement(temporaryPath, destination, temporary);
				} catch (error) {
					if (!isEexist(error)) throw error;
				}
				// Once publication starts, finish verification/durability even if cancellation arrives.
				const artifact = await fs.open(
					destination,
					fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
				);
				try {
					const published = await artifact.stat({ bigint: true });
					requirePrivateFile(published);
					await verifyPreservedArtifact(engagementRoot, relativePath, sha256, byteCount);
					requireCondition(
						sameFileState(published, await artifact.stat({ bigint: true })) &&
							sameFileState(published, await fs.lstat(destination, { bigint: true })),
						"Published artifact changed during verification",
					);
					await artifact.sync();
				} finally {
					await artifact.close();
				}
				await directory.sync();
				result = { relativePath, sha256, byteCount };
			} catch (error) {
				failure = { error };
			}
			try {
				if (owned) {
					const remaining = await fs.lstat(temporaryPath, { bigint: true });
					requireCondition(
						remaining.isFile() && sameInode(owned, remaining),
						"Refusing to remove a temporary artifact not owned by this preservation",
					);
					await fs.unlink(temporaryPath);
					await directory.sync();
				}
			} catch (error) {
				if (!isEnoent(error)) {
					failure = {
						error: failure
							? new AggregateError(
									[failure.error, error],
									"Artifact preservation and owned temporary cleanup failed",
								)
							: error,
					};
				}
			} finally {
				try {
					await temporary.close();
				} catch (error) {
					failure = {
						error: failure
							? new AggregateError(
									[failure.error, error],
									"Artifact preservation and temporary handle close failed",
								)
							: error,
					};
				}
			}
			if (failure) throw failure.error;
			requireCondition(result, "Artifact preservation produced no verified file");
			return result;
		} finally {
			await directory.close();
		}
	} finally {
		await source.close();
	}
}
