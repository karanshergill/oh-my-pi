import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sha256File } from "@oh-my-pi/pi-coding-agent/utils/file-hash";
import { requireCondition, uuid } from "./record-sql";

/** Verify metadata against a stable existing file; never write or repair it. */
export async function verifyExistingFile(
	root: string,
	relativePath: string,
	expectedHash: string,
	expectedSize?: string,
): Promise<{ sha256: string; byteCount: string }> {
	requireCondition(/^[0-9a-f]{64}$/.test(expectedHash), "Invalid expected artifact SHA-256");
	const inspected = await inspectExistingFile(root, relativePath);
	requireCondition(
		inspected.sha256 === expectedHash && (expectedSize === undefined || inspected.byteCount === expectedSize),
		"Existing artifact content does not match metadata",
	);
	return inspected;
}

/** Read stable existing-file identity without claiming a match to supplied metadata. */
export async function inspectExistingFile(
	root: string,
	relativePath: string,
): Promise<{ sha256: string; byteCount: string }> {
	requireCondition(
		path.isAbsolute(root) && path.resolve(root) === root && (await fs.realpath(root)) === root,
		"Engagement root must be explicit, absolute and canonical",
	);
	const file = path.join(root, relativePath);
	requireCondition(
		file.startsWith(`${root}/`) && (await fs.realpath(file)) === file,
		"Artifact path escapes root or includes a symlink",
	);
	const before = await fs.lstat(file, { bigint: true });
	requireCondition(before.isFile() && !before.isSymbolicLink(), "Expected regular existing file");
	const hash = await sha256File(file);
	const after = await fs.lstat(file, { bigint: true });
	requireCondition(
		after.isFile() &&
			before.dev === after.dev &&
			before.ino === after.ino &&
			before.size === after.size &&
			before.mtimeNs === after.mtimeNs &&
			before.ctimeNs === after.ctimeNs,
		"Artifact changed during verification",
	);
	return { sha256: hash, byteCount: after.size.toString() };
}
export async function verifyPreservedArtifact(
	root: string,
	relativePath: string,
	sha256: string,
	byteCount: string,
): Promise<void> {
	requireCondition(
		relativePath === `artifacts/sha256/${sha256}`,
		"Preserved artifact must use artifacts/sha256/<sha256> under the engagement root",
	);
	await verifyExistingFile(root, relativePath, sha256, byteCount);
}
/** Exact export bytes contract shared with the parent exporter; hashing is not export. */
export function reportExportText(title: string, body: string): string {
	return `# ${title}\n\n${body}\n`;
}
export function reportExportSha256(title: string, body: string): string {
	return new Bun.CryptoHasher("sha256").update(reportExportText(title, body)).digest("hex");
}
export async function verifyReportExport(
	root: string,
	findingId: string,
	title: string,
	body: string,
	intendedHash: string,
): Promise<void> {
	requireCondition(
		reportExportSha256(title, body) === intendedHash,
		"Export intent does not identify the canonical report bytes",
	);
	await verifyExistingFile(root, `exports/${uuid(findingId)}.md`, intendedHash);
}
