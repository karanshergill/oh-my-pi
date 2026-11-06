import type { VerifiedReportFile } from "./export-file";
import type { PreservedArtifactFile } from "./preserve-artifact";
import type { RootState } from "./runtime";
import type {
	ApplyRecordReceipt,
	CheckpointReason,
	HuntChange,
	InspectRecordsRequest,
	InspectRecordsResult,
	JsonDocument,
	OrdinaryFields,
} from "./record-types";

export interface ExportHuntRequest extends MutationRequest {
	readonly action: "export";
	readonly finding: { readonly id: string; readonly revision: string };
	readonly reportRevisionId: string;
}

export interface RecorderTrace {
	readonly sessionId: string;
	readonly toolCallId: string;
	readonly leafId: string | null;
}
interface EngagementRequest {
	readonly engagementId: string;
}
interface MutationRequest extends EngagementRequest {
	readonly operationId: string;
}
export interface InitializeHuntRequest extends MutationRequest {
	readonly action: "initialize";
	readonly name: string;
	readonly objective?: string | null;
	readonly contextGaps?: JsonDocument | null;
}
export interface SaveHuntRequest extends MutationRequest {
	readonly action: "save";
	readonly changes: readonly HuntChange[];
}
export interface CheckpointHuntRequest extends MutationRequest {
	readonly action: "checkpoint";
	readonly reason: CheckpointReason;
	readonly detail?: string;
}
export interface PreserveHuntRequest extends MutationRequest {
	readonly action: "preserve";
	readonly sourcePath: string;
	readonly evidence:
		| {
				readonly mode: "create";
				readonly id: string;
				readonly fields: Omit<
					OrdinaryFields["evidence"],
					"byte_count" | "sha256" | "local_preservation" | "artifact_relative_path"
				>;
		  }
		| { readonly mode: "update"; readonly id: string; readonly revision: string };
}
export type HuntRequest =
	| InitializeHuntRequest
	| SaveHuntRequest
	| CheckpointHuntRequest
	| PreserveHuntRequest
	| ExportHuntRequest
	| (EngagementRequest & { readonly action: "status" })
	| (EngagementRequest & { readonly action: "inspect"; readonly query: InspectRecordsRequest })
	| (MutationRequest & { readonly action: "operation" | "resume" });
export interface HuntStatusResult {
	readonly kind: "status";
	readonly engagementId: string;
	readonly database: string;
	readonly phase: "absent" | "ready" | "incomplete" | "conflict" | "unsettled";
	readonly activeOperationId: string | null;
	readonly pendingStep: string | null;
	readonly observed: RootState | null;
	readonly detail: string | null;
}
export interface HuntOperationResult {
	readonly kind: "operation";
	readonly engagementId: string;
	readonly operationId: string;
	/** Outcome of the requested record batch, not its preparation metadata. */
	readonly sqlState: "saved" | "not_saved" | "uncertain";
	readonly receipt: ApplyRecordReceipt | null;
	readonly checkpoint: {
		readonly id: string | null;
		readonly state: "not_requested" | "pending" | "uncertain" | "confirmed" | "content_conflict" | "failed";
		readonly hash: string | null;
	};
	readonly detail: string | null;
}
export interface HuntInspectionResult {
	readonly kind: "records";
	readonly engagementId: string;
	readonly coordination: HuntStatusResult;
	readonly data: InspectRecordsResult;
}
export interface HuntPreservationResult {
	readonly kind: "preservation";
	readonly engagementId: string;
	readonly operation: HuntOperationResult;
	/** Verified bytes are separate from SQL registration and history preservation. */
	readonly artifact: PreservedArtifactFile | null;
	readonly detail: string | null;
}
export interface HuntExportResult {
	readonly kind: "export";
	readonly engagementId: string;
	readonly findingId: string;
	readonly reportRevisionId: string;
	readonly operation: HuntOperationResult;
	readonly attempt: {
		readonly id: string;
		readonly revision: string;
		readonly result: "prepared" | "uncertain" | "succeeded" | "conflict" | "failed";
	} | null;
	/** Current verified bytes do not replace the original operation's receipt. */
	readonly file: VerifiedReportFile | null;
	readonly detail: string | null;
}
export type HuntResult =
	| HuntStatusResult
	| HuntOperationResult
	| HuntInspectionResult
	| HuntPreservationResult
	| HuntExportResult;
