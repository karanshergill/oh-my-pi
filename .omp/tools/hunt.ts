import type { Type } from "@oh-my-pi/omptype";
import type { CustomTool, CustomToolAPI } from "@oh-my-pi/pi-coding-agent";
import type { Component } from "@oh-my-pi/pi-tui";
import {
	cappedHeadLines,
	createCachedComponent,
	formatMoreItems,
	PREVIEW_LIMITS,
	sanitizeDisplayLines,
	shortenEmbeddedPaths,
	truncateToWidth,
} from "@oh-my-pi/pi-tui/render/render-utils";
import type { RenderResultOptions, ToolRenderResult } from "@oh-my-pi/pi-tui/tools/renderer";
import { RecordError, requireCondition } from "./hunt/record-sql";
import { executeHuntRequest } from "./hunt/store";
import type { HuntRequest, HuntResult, RecorderTrace } from "./hunt/store-types";
import { buildHuntParameters, type HuntToolParameters } from "./hunt/tool-schema";
import description from "./hunt/hunt-tool.md" with { type: "text" };

export interface HuntToolFailure {
	readonly kind: "adapter-error";
	readonly stage: "validation" | "recorder-context" | "execution";
	readonly request: HuntRequest | null;
	readonly executorInvoked: boolean;
	readonly persistence: "unknown";
	readonly error: { readonly name: string; readonly message: string; readonly code: string | null };
}
export type HuntToolDetails = HuntResult | HuntToolFailure;

function summarize(result: HuntResult): string {
	switch (result.kind) {
		case "operation": {
			const sql =
				result.sqlState === "saved"
					? "SQL saved."
					: result.sqlState === "not_saved"
						? "Requested record batch not saved; preparation metadata may exist."
						: "SQL outcome uncertain; do not assume rollback or repeat target actions.";
			const checkpoint =
				result.checkpoint.state === "confirmed"
					? `Checkpoint confirmed: ${result.checkpoint.hash}.`
					: `Checkpoint ${result.checkpoint.state}; no checkpoint confirmation is claimed.`;
			return `${sql} ${checkpoint} Operation ${result.operationId}.`;
		}
		case "preservation":
			return `${result.artifact ? `Artifact bytes verified: ${result.artifact.byteCount} bytes at ${result.artifact.relativePath}.` : "Artifact bytes not confirmed."} ${summarize(result.operation)}`;
		case "export":
			return `${result.file ? `Report bytes verified: ${result.file.byteCount} bytes at ${result.file.relativePath}.` : "Report bytes not confirmed."} Export attempt ${result.attempt?.result ?? "unavailable"}. ${summarize(result.operation)}`;
		case "status":
			return `Engagement ${result.engagementId}: ${result.phase}; active operation ${result.activeOperationId ?? "none"}; pending step ${result.pendingStep ?? "none"}.`;
		case "records":
			return `Engagement ${result.engagementId}: ${result.data.rows.length} record(s), ${result.data.view.kind} view; coordination ${result.coordination.phase}; next page ${result.data.next === null ? "none" : "available"}.`;
	}
}

function renderPreview(text: string, options: RenderResultOptions): Component {
	const lines = sanitizeDisplayLines(shortenEmbeddedPaths(text));
	return createCachedComponent(
		() => options.expanded,
		(width, expanded) => {
			const preview = cappedHeadLines(
				lines,
				expanded ? PREVIEW_LIMITS.OUTPUT_EXPANDED : PREVIEW_LIMITS.OUTPUT_COLLAPSED,
			);
			const rendered = preview.lines.map(line => truncateToWidth(line, width));
			if (preview.hidden) rendered.push(truncateToWidth(formatMoreItems(preview.hidden, "line"), width));
			return rendered;
		},
	);
}

function resultText(result: ToolRenderResult): string {
	const texts: string[] = [];
	for (const block of result.content) {
		if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
	}
	return texts.join("\n");
}

/** OMP injects its schema builder; no runtime SDK import or model-supplied provenance. */
export default function huntTool(api: CustomToolAPI): CustomTool<Type<HuntToolParameters>, HuntToolDetails> {
	const parameters = buildHuntParameters(api);
	return {
		name: "hunt",
		label: "Hunt records",
		description,
		parameters,
		renderCall(args, options) {
			const intent = typeof args?.i === "string" ? args.i : "Hunt records";
			return renderPreview(`${intent} · ${args?.request?.action ?? "pending"}`, options);
		},
		renderResult(result, options) {
			return renderPreview(resultText(result), options);
		},
		describeCall(args, options) {
			return {
				head: "Hunt records",
				body: [renderPreview(`Action: ${args?.request?.action ?? "pending"}`, options)],
			};
		},
		describeResult(result, options) {
			return { body: [renderPreview(resultText(result), options)] };
		},
		async execute(toolCallId, input, _onUpdate, ctx, signal) {
			let stage: HuntToolFailure["stage"] = "validation";
			let request: HuntRequest | null = null;
			try {
				// Validate here as well: direct invocations must not bypass the public schema.
				request = parameters.assert(input).request;
				stage = "recorder-context";
				const recorder: RecorderTrace = {
					sessionId: ctx.sessionManager.getSessionId(),
					leafId: ctx.sessionManager.getLeafId(),
					toolCallId,
				};
				requireCondition(
					typeof recorder.sessionId === "string" && recorder.sessionId.length > 0,
					"Actual OMP session ID is required",
				);
				requireCondition(
					typeof recorder.toolCallId === "string" && recorder.toolCallId.length > 0,
					"Actual OMP tool-call ID is required",
				);
				requireCondition(
					recorder.leafId === null || (typeof recorder.leafId === "string" && recorder.leafId.length > 0),
					"Actual OMP leaf ID must be a string or null",
				);
				stage = "execution";
				const result = await executeHuntRequest(request, recorder, signal);
				return {
					content: [{ type: "text", text: `${summarize(result)}\n${JSON.stringify(result, null, 2)}` }],
					details: result,
				};
			} catch (error) {
				const details: HuntToolFailure = {
					kind: "adapter-error",
					stage,
					request,
					executorInvoked: stage === "execution",
					persistence: "unknown",
					error: {
						name: error instanceof Error ? error.name : "Error",
						message: error instanceof Error ? error.message : String(error),
						code: error instanceof RecordError ? error.code : null,
					},
				};
				const dispatch = details.executorInvoked
					? "The persistence executor was invoked. This exception does not prove that no write occurred."
					: "The persistence executor was not invoked by this call. This does not establish the outcome of an earlier call.";
				const recovery =
					request && "operationId" in request
						? `Inspect action=operation for engagementId=${request.engagementId}, operationId=${request.operationId}; use resume only to reconcile persistence and finish its checkpoint, never to repeat target actions.`
						: "Inspect engagement status before drawing conclusions about persisted state.";
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `${details.error.name}: ${details.error.message}\n${dispatch}\n${recovery}\n${JSON.stringify(details, null, 2)}`,
						},
					],
					details,
				};
			}
		},
	};
}
