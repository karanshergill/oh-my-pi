---
name: caido-files
description: "Manage files hosted by Caido: inspect metadata, upload wordlists and other files, rename or delete them, and manage replacement files used by Automate or workflows."
---

# Caido files

MUST read `skill://caido-access` unless its guidance is already available in context.

## Operations

Use the singular namespace `client.hostedFile`.

| Operation | SDK |
|---|---|
| List files | `client.hostedFile.list()` |
| Upload | `client.hostedFile.upload({ name, file })` |
| Rename | `client.hostedFile.rename(id, name)` |
| Delete | `client.hostedFile.delete(id)` |

- `list()` returns an array of metadata records, not a paginated builder.
- Each record includes `id`, `name`, `path`, `size`, `status`,
  `createdAt`, and `updatedAt`.
- There is no verified high-level `get`, content-download, or
  in-place content-update method. Resolve an individual record from
  the returned list rather than inventing one.
- Keep the source file, hosted-file ID, display name, and returned
  storage path distinct.
- Treat `path` as Caido-provided storage metadata. Do not assume it is
  accessible on the agent's machine or is a download URL.

## Upload

- `file` must be a `File` containing the intended bytes.
- `name` is the requested hosted-file name; it is not a local path
  for Caido to open.
- Preserve bytes, encoding, line endings, ordering, duplicate entries,
  and empty lines unless the task requests a transformation.
- Do not Base64-encode a wordlist or other file merely because direct
  GraphQL `Blob` fields use Base64. File uploads use the distinct
  `Upload` scalar.
- Let the supported SDK upload transport handle the file. Do not
  serialize a file object into an ordinary JSON object or substitute
  its local filename for its contents.
- Inspect the returned record and refresh the listing as needed.
  Verified statuses are `READY` and `ERROR`; do not invent an
  `UPLOADING` state or a background task ID.
- An `ERROR` record is not a usable upload. A `READY` record establishes
  availability, not that a later Automate run consumed the intended
  payloads.
- Retain the returned ID for consumers; do not identify the upload
  merely by taking the first matching filename.

## Consumers and replacement

- Use `skill://caido-automate` to bind the hosted-file ID to an Automate
  Hosted File payload source and verify the resulting payload settings.
- Use `skill://caido-workflows` for workflow consumers. Establish how
  that workflow references the file rather than assuming a filename,
  hosted-file ID, and server path are interchangeable.
- Uploading a file does not launch Automate or execute a workflow.
- Preserve the source file's intended payload structure. Do not claim
  a particular line-to-payload interpretation without checking the
  consuming feature's settings and behavior.
- Renaming changes metadata; it is not content replacement. Do not
  assume a rename also rewrites path-based or name-based consumers.
- For requested content replacement:
  1. Upload the replacement and verify it is usable.
  2. Update the intended consumers to its actual returned ID or
     supported reference.
  3. Verify those references before retiring the previous file.
- Do not assume uploading under an old name overwrites its bytes,
  preserves its ID, or retargets existing consumers.
- Keep unrelated files and references unchanged.

## GraphQL and events

When direct GraphQL is needed, the verified operations are:

- Query: `hostedFiles`
- Mutations: `uploadHostedFile`, `renameHostedFile`, `deleteHostedFile`
- Subscriptions: `uploadedHostedFile`, `updatedHostedFile`,
  `deletedHostedFile`

- Upload takes `input: { name, file }`; rename takes `id` and `name`;
  delete takes `id`.
- Upload and rename payloads contain an optional `hostedFile`; deletion
  contains an optional `deletedId`.
- These verified payloads do not expose a nested `error` field.
  Handle transport and GraphQL errors, and check the actual returned
  record or deletion acknowledgement rather than querying invented
  fields.
- Upload and update events contain `hostedFile`; deletion events contain
  `deletedHostedFileId`.
- Correlate events by ID and refresh the listing after a monitoring gap.
  Do not infer a file's identity from its name alone.

## Content access and deletion

- Metadata listing is not file-content retrieval. Neither a `READY`
  status nor matching size proves that remote bytes were downloaded
  and compared.
- No hosted-file download route is verified by the inspected SDK and
  REST contracts. If reading remote contents is required, establish a
  supported interface for that instance or configured host access;
  do not manufacture a URL from the returned storage path.
- Delete by the resolved hosted-file ID, not by issuing filesystem
  deletion against an assumed local copy of `path`.
- Account for the intended Automate or workflow references before
  deletion. Do not claim that deleting a file automatically repairs
  those references or cancels running jobs.
- File deletion and task cancellation are separate operations; use
  the consuming skill when cancellation is also requested.
- After deletion, verify the ID is absent from the hosted-file listing.
  Distinguish a successful deletion from a file that was already absent.
- Report the file ID, name, status, relevant metadata, consumer
  references changed, and verification performed. Distinguish
  metadata checks from byte-level or execution checks.
