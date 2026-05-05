import { Skeleton } from "@platform/ui";

export default function ResumeUploadSectionSkeleton() {
  return (
    <div className="border rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="w-32 h-5 rounded" />
      </div>

      {/* Dropzone placeholder */}
      <Skeleton className="w-full h-28 rounded-lg" />

      {/* Job list rows */}
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="w-8 h-8 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="w-48 h-4 rounded" />
            <Skeleton className="w-32 h-3 rounded" />
          </div>
          <Skeleton className="w-16 h-5 rounded" />
        </div>
      ))}
    </div>
  );
}
