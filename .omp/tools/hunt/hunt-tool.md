Persist and inspect structured hunt records, preserve selected local artifacts, export one report file per finding, and reconcile Dolt checkpoints. Use for record persistence and recovery, not target execution or arbitrary SQL.

<critical>
- You MUST distinguish SQL persistence from checkpoint confirmation.
- You MUST distinguish verified artifact bytes from evidence registration.
- You MUST distinguish report bytes, export metadata, readiness, and submission.
- You MUST preserve the operationId when retrying identical mutation input.
- You NEVER reuse an operationId for different mutation input.
- You NEVER treat an exception, cancellation, or timeout as proof of rollback.
- You NEVER use resume to repeat target actions.
</critical>

Parameters: `{ "i": "Concise intent", "request": { ... } }`. `request.action` selects:

- `initialize`: engagementId, operationId, name; optional objective and contextGaps. Complete but uninitialized schema accepts only the identical original initialization input; partial or mismatched setup requires maintenance.
- `save`: engagementId, operationId, changes. Successful persistence automatically requests its checkpoint.
- `preserve`: engagementId, operationId, absolute sourcePath, evidence. Create with `evidence={mode:"create",id,fields}`; update an existing evidence record with `evidence={mode:"update",id,revision}`. The tool computes the preserved path, SHA-256, byte count, and local-preservation state; these are not create-mode input fields. It copies a selected local file, not an entire native-tool store or a remote URL.
- `export`: engagementId, operationId, finding `{id,revision}`, reportRevisionId. Export the finding's current nonstale saved report to its fixed `exports/<finding-id>.md`; paths, body text, and hashes are not input fields. Matching bytes are verified without rewriting; unexpected existing content is not overwritten.
- `checkpoint`: engagementId, operationId, reason; optional detail. Reasons: target_model, experiment_result, assessment, report, sync, handoff, other.
- `status`: engagementId; inspect coordination before modifying an unsettled engagement.
- `inspect`: engagementId, query; read records and relationships without arbitrary SQL.
- `operation`: engagementId, operationId; read-only inspection of the original persistence receipt/checkpoint. Export operations also return the current attempt and file observation; inspection never settles the attempt or writes the file.
- `resume`: engagementId, operationId; reconcile persistence and finish its checkpoint. A prepared export is reconciled from existing file bytes without publishing or restoring a file.

IDs are canonical lowercase UUID strings. Revisions and unsigned counts are exact decimal strings, not JSON numbers. Timestamps use UTC `YYYY-MM-DD HH:mm:ss.ffffff`. JSON-valued fields use `{ "json": "<JSON text>" }`, preserving exact numeric text. Optional fields may be omitted; null is accepted only where the schema permits it. Unknown fields are rejected, including nested fields.

`changes` accepts semantic operations: create, edit, relation, experiment, observation, claim, verification, verification-result, finding-assessment, contradiction, contradiction-event, report, report-checkpoint, caido-link, sync-intent, sync-outcome, export-outcome. Each variant has required fields and permitted tables. You MUST use the schema, not invent columns or readbacks. Accepted input shape does not establish a scientifically valid change. Use `export` for publication; `save` with `export-outcome` is for explicit reconciliation of a settled attempt, not file writing.

- You MUST inspect current revisions before edits or owner-guarded changes.
- Within `save`, supply revision guards as `{ "table": "...", "id": "...", "revision": "..." }`; `export.finding` accepts only `{ "id": "...", "revision": "..." }`.
- You MUST distinguish observations, assumptions, inferences, and material unknowns.
- You MUST attribute contributors, executors, originators, and verifiers explicitly.
- You NEVER count the automatic recorder as a scientific contributor or verifier.
- You NEVER claim native synchronization succeeded from model-authored readback fields.

OMP supplies the actual recorder session, leaf, and tool-call identity. Recorder provenance and trusted native readbacks are not request parameters. This tool records sync/export intent and outcomes subject to domain evidence checks; it does not run target actions or infer native finding associations from titles.

Inspection queries:

- `get`: `{ "kind": "get", "locator": { "table": "...", "key": { "id": "..." } } }`.
- `list`: `{ "kind": "list", "table": "...", "limit": 20 }`; optional where and after are column-to-string maps.
- `relationships`: kind, locator, relatedTable, foreignKey, direction (`outgoing` or `incoming`), limit; optional after.
- `asOf` optionally selects an exact confirmed 32-character Dolt checkpoint hash. It is not a branch name or SQL expression. An unavailable checkpoint is an error, not an empty result.
- `next` supplies the next page's `after` map. You MUST retain the same query and view when paging.

Example — inspect an engagement's investigations:

```json
{
	"i": "Inspecting investigation records",
	"request": {
		"action": "inspect",
		"engagementId": "a674f539-d926-4ccf-8369-51ecc75dce41",
		"query": { "kind": "list", "table": "investigations", "limit": 20 }
	}
}
```

Example — save a surface record using a caller-stable operation ID:

```json
{
	"i": "Recording observed login surface",
	"request": {
		"action": "save",
		"engagementId": "a674f539-d926-4ccf-8369-51ecc75dce41",
		"operationId": "e6e84a31-b345-4f24-bd79-02ec6f5f70eb",
		"changes": [
			{
				"kind": "create",
				"table": "surfaces",
				"id": "7968ad4e-82ee-44f0-8c8d-ad7ac10aa1a3",
				"fields": { "label": "Login endpoint", "observed_features": { "json": "{\"path\":\"/login\"}" } }
			}
		]
	}
}
```

Example — preserve a selected file for an existing evidence record:

```json
{
	"i": "Preserving selected response bytes",
	"request": {
		"action": "preserve",
		"engagementId": "a674f539-d926-4ccf-8369-51ecc75dce41",
		"operationId": "92d67560-72fa-4604-9d49-f42bff97d252",
		"sourcePath": "/tmp/selected-response.bin",
		"evidence": {
			"mode": "update",
			"id": "5c2872bf-df73-428b-a11d-85e0db99446c",
			"revision": "3"
		}
	}
}
```

Use actual engagement, record, and operation IDs, the current evidence revision, and an existing selected source file rather than these example values.

Results include structured details and the full JSON result in text. `sqlState` describes the requested record batch, not preparation metadata: `saved` reports persistence, `not_saved` is an explicit coordinator result, and `uncertain` leaves the outcome unresolved. Only `checkpoint.state=confirmed` positively confirms the returned checkpoint hash. Preserve immutable receipts and generated IDs. An adapter error does not prove rollback or establish the outcome of an earlier call.

`preserve` returns `kind=preservation`: `operation` contains the SQL receipt and checkpoint outcome; a non-null `artifact` identifies verified local bytes. File verification does not establish capture completeness, source authenticity, or impact. Registration can fail after a successful copy; retained bytes are not then a completed evidence save.

An identical preservation retry never recopies the source. A saved receipt identifies the artifact to verify even when the source is gone; missing or corrupt stored bytes remain an explicit gap, not an automatic repair. `resume` reconciles SQL/checkpoint state only. New derivatives require their original-evidence relationships: save that evidence record and lineage first, then preserve using update mode.

`export` returns `kind=export`: the original `operation` receipt/checkpoint, current `attempt`, and currently verified `file` or null. A historical successful attempt does not prove that its file still exists or matches. Export does not establish readiness, bundle attachments, synchronize Caido, or submit a report.

Interrupted export? Inspect its operation. Identical `export` input only observes; it never republishes or changes the saved receipt. `resume` can settle a durable prepared attempt by verifying existing bytes and saving the outcome. Missing, changed, or unsafe files remain explicit; they are never restored by replay or resume. A new publication requires a fresh operation ID and current finding revision.

Example — export a saved report using actual current IDs and revision:

```json
{
	"i": "Exporting the current report",
	"request": {
		"action": "export",
		"engagementId": "a674f539-d926-4ccf-8369-51ecc75dce41",
		"operationId": "c29c0360-adc6-4d9a-98a6-7b0d408b13c6",
		"finding": { "id": "455031cb-2501-48a3-a33f-eaaf1bd947da", "revision": "8" },
		"reportRevisionId": "5744de8e-58de-4487-bd71-0ad270a6590b"
	}
}
```

<critical>
After an uncertain outcome, you MUST inspect the same operation and reconcile persistence. You NEVER invent success, issue a fresh operation to bypass uncertainty, or rerun target actions during resume.
Working-state conflict? You MUST inspect it. You NEVER discard records, force a checkpoint, or change branches to bypass it.
</critical>
