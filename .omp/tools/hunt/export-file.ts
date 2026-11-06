import type * as nodeFs from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { writeFileAtomically } from "@oh-my-pi/pi-coding-agent/utils/atomic-file";
import { isEexist, isEnoent } from "@oh-my-pi/pi-utils/fs-error";
import { inspectExistingFile, reportExportSha256, reportExportText } from "./record-artifacts";
import { requireCondition, uuid } from "./record-sql";
import { assertPrivateDirectory } from "./runtime";

export type ReportFileSnapshot =
	| { readonly state: "absent" }
	| { readonly state: "present"; readonly sha256: string; readonly byteCount: string };

export interface VerifiedReportFile {
	readonly relativePath: string;
	readonly sha256: string;
	readonly byteCount: string;
}

export interface ReportFileRequest {
	readonly engagementRoot: string;
	readonly findingId: string;
	readonly title: string;
	readonly body: string;
	readonly previous: ReportFileSnapshot;
	readonly lastExportedHash: string | null;
}

export interface ReportPublication {
	readonly result: "succeeded" | "conflict" | "failed" | "uncertain";
	readonly file: VerifiedReportFile | null;
	readonly detail: string;
}

class ReportFileConflict extends Error {}

function sameFileState(before: nodeFs.BigIntStats, after: nodeFs.BigIntStats): boolean {
	return (
		before.isFile() &&
		after.isFile() &&
		before.dev === after.dev &&
		before.ino === after.ino &&
		before.size === after.size &&
		before.mtimeNs === after.mtimeNs &&
		before.ctimeNs === after.ctimeNs
	);
}

function requirePrivateFile(stat: nodeFs.BigIntStats): void {
	const uid = process.getuid?.();
	requireCondition(
		stat.isFile() && (stat.mode & 0o7777n) === 0o600n && (uid === undefined || stat.uid === BigInt(uid)),
		"Report export must be an owner-private regular file with mode 0600",
	);
}

async function assertReportDirectories(root: string): Promise<void> {
	requireCondition(
		path.isAbsolute(root) && path.resolve(root) === root,
		"Engagement root must be explicit, absolute and canonical",
	);
	for (const directory of [root, path.join(root, "exports")]) {
		await assertPrivateDirectory(directory);
		requireCondition((await fs.realpath(directory)) === directory, "Report directory must not include a symlink");
	}
}

function sameSnapshot(left: ReportFileSnapshot, right: ReportFileSnapshot): boolean {
	return (
		left.state === right.state &&
		(left.state === "absent" ||
			(right.state === "present" && left.sha256 === right.sha256 && left.byteCount === right.byteCount))
	);
}

/** Read-only inspection; a dangling symlink is unsafe, not an absent report. */
export async function inspectReportFile(root: string, findingId: string): Promise<ReportFileSnapshot> {
	const relativePath = `exports/${uuid(findingId)}.md`;
	await assertReportDirectories(root);
	const destination = path.join(root, relativePath);
	let selected: nodeFs.BigIntStats;
	try {
		selected = await fs.lstat(destination, { bigint: true });
	} catch (error) {
		if (!isEnoent(error)) throw error;
		// Missing parents are not evidence that the destination alone is absent.
		await assertReportDirectories(root);
		return { state: "absent" };
	}
	requirePrivateFile(selected);
	const handle = await fs.open(destination, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
	try {
		const opened = await handle.stat({ bigint: true });
		requirePrivateFile(opened);
		requireCondition(sameFileState(selected, opened), "Report changed before inspection");
		const inspected = await inspectExistingFile(root, relativePath);
		const after = await handle.stat({ bigint: true });
		const named = await fs.lstat(destination, { bigint: true });
		requirePrivateFile(after);
		requirePrivateFile(named);
		requireCondition(
			sameFileState(opened, after) && sameFileState(opened, named),
			"Report changed during inspection",
		);
		await assertReportDirectories(root);
		return { state: "present", ...inspected };
	} finally {
		await handle.close();
	}
}

/** Pin the verified inode while flushing; never repair or remove a published report. */
export async function verifyAndFlushReport(root: string, expected: VerifiedReportFile): Promise<VerifiedReportFile> {
	await assertReportDirectories(root);
	const exportsDirectory = path.join(root, "exports");
	const directory = await fs.open(
		exportsDirectory,
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_DIRECTORY,
	);
	try {
		const directoryState = await directory.stat({ bigint: true });
		const destination = path.join(root, expected.relativePath);
		const file = await fs.open(
			destination,
			fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
		);
		try {
			const before = await file.stat({ bigint: true });
			requirePrivateFile(before);
			const inspected = await inspectExistingFile(root, expected.relativePath);
			requireCondition(
				inspected.sha256 === expected.sha256 && inspected.byteCount === expected.byteCount,
				"Report export does not match the canonical bytes",
			);
			await file.sync();
			await directory.sync();
			const after = await file.stat({ bigint: true });
			const named = await fs.lstat(destination, { bigint: true });
			requirePrivateFile(after);
			requirePrivateFile(named);
			requireCondition(
				sameFileState(before, after) && sameFileState(before, named),
				"Report changed during verification or flush",
			);
			await assertReportDirectories(root);
			const namedDirectory = await fs.lstat(exportsDirectory, { bigint: true });
			requireCondition(
				directoryState.dev === namedDirectory.dev && directoryState.ino === namedDirectory.ino,
				"Report directory changed during verification or flush",
			);
		} finally {
			await file.close();
		}
	} finally {
		await directory.close();
	}
	return expected;
}

/** Caller holds the engagement lock. Snapshot checks are optimistic guards, not filesystem CAS. */
export async function publishReportFile(request: ReportFileRequest, signal?: AbortSignal): Promise<ReportPublication> {
	let publicationMayHaveStarted = false;
	let noOverwrite = false;
	let writerCompleted = false;
	try {
		signal?.throwIfAborted();
		const relativePath = `exports/${uuid(request.findingId)}.md`;
		const text = reportExportText(request.title, request.body);
		const expected: VerifiedReportFile = {
			relativePath,
			sha256: reportExportSha256(request.title, request.body),
			byteCount: Buffer.byteLength(text, "utf8").toString(),
		};
		const observed = await inspectReportFile(request.engagementRoot, request.findingId);
		if (!sameSnapshot(observed, request.previous))
			throw new ReportFileConflict("Report changed since the export snapshot; existing bytes were preserved");
		if (
			observed.state === "present" &&
			observed.sha256 === expected.sha256 &&
			observed.byteCount === expected.byteCount
		) {
			signal?.throwIfAborted();
			const file = await verifyAndFlushReport(request.engagementRoot, expected);
			return { result: "succeeded", file, detail: "Verified and flushed the matching report without rewriting it" };
		}
		if (observed.state === "present" && observed.sha256 !== request.lastExportedHash)
			throw new ReportFileConflict("Existing report differs from the last exported bytes; it was not overwritten");
		noOverwrite = observed.state === "absent";
		signal?.throwIfAborted();
		await writeFileAtomically(path.join(request.engagementRoot, relativePath), text, 0o600, {
			replace: !noOverwrite,
			beforePublish: async () => {
				signal?.throwIfAborted();
				const current = await inspectReportFile(request.engagementRoot, request.findingId);
				if (!sameSnapshot(current, observed))
					throw new ReportFileConflict("Report changed while staging the export; existing bytes were preserved");
				await assertReportDirectories(request.engagementRoot);
				signal?.throwIfAborted();
				publicationMayHaveStarted = true;
			},
		});
		writerCompleted = true;
		// Once publication may have started, finish durability/verification despite cancellation.
		const file = await verifyAndFlushReport(request.engagementRoot, expected);
		return { result: "succeeded", file, detail: "Published, flushed and verified the canonical report" };
	} catch (error) {
		if (
			error instanceof ReportFileConflict ||
			(publicationMayHaveStarted && noOverwrite && !writerCompleted && isEexist(error))
		)
			return {
				result: "conflict",
				file: null,
				detail:
					error instanceof ReportFileConflict
						? error.message
						: "A report appeared before publication; it was not overwritten",
			};
		const detail = error instanceof Error ? error.message : String(error);
		return {
			result: publicationMayHaveStarted ? "uncertain" : "failed",
			file: null,
			detail: publicationMayHaveStarted
				? `Report publication may have occurred; the destination was not removed or repaired: ${detail}`
				: `Report export failed before publication; the destination was not changed: ${detail}`,
		};
	}
}
