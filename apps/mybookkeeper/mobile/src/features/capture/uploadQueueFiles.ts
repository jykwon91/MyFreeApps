import { mimeTypeFor } from "@platform/core/utils/mimeTypeFor";
import { discardFile } from "@platform/mobile";
import { nanoid } from "@reduxjs/toolkit";
import { Directory, File, Paths } from "expo-file-system";
import { UPLOAD_QUEUE_DIRECTORY } from "../../constants/capture";
import { session } from "../../lib/session";
import type { PendingUpload } from "../../types/PendingUpload";

/** Files on disk are the queue, so a photo survives the app being killed before it's sent. */
function queueRoot(): Directory {
  return new Directory(Paths.document, UPLOAD_QUEUE_DIRECTORY);
}

/** By person as well: two people can share a workspace, and one's waiting photos aren't the other's to send. */
function workspaceQueue(workspaceId: string): Directory {
  const state = session.getState();
  const person = state.status === "signedIn" ? encodeURIComponent(state.email) : "nobody";
  return new Directory(queueRoot(), `${person}~${workspaceId}`);
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-100);
}

function toPendingUpload(file: File): PendingUpload {
  const name = file.name.split("~").slice(2).join("~");
  return { uri: file.uri, name, mimeType: mimeTypeFor(name) };
}

/** Moves the file in, which is all or nothing, so a killed app can't leave half a photo to send. */
export function addToQueue(workspaceId: string, sourceUri: string, name: string): void {
  const directory = workspaceQueue(workspaceId);
  directory.create({ idempotent: true, intermediates: true });
  // The time first, so the name order is the order they were taken in.
  new File(sourceUri).move(new File(directory, `${Date.now()}~${nanoid(6)}~${safeFileName(name)}`));
}

export function pendingUploads(workspaceId: string): PendingUpload[] {
  const directory = workspaceQueue(workspaceId);
  if (!directory.exists) return [];
  return directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(toPendingUpload);
}

export function removeFromQueue(upload: PendingUpload): void {
  discardFile(upload.uri);
}

/** Also for the camera's and the pickers' own copies, which still hold the photo's location. */
export function clearUploadQueue(): void {
  const root = queueRoot();
  if (root.exists) root.delete();
}
