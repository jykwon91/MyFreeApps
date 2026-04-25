import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

export default function MembersSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* SectionHeader: "Members" + subtitle */}
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>

      {/* Team members card — matches Card title="Team members" + MemberList table */}
      <Card>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-3 px-4 py-3 bg-muted/50 gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
          {/* Member rows */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-3 px-4 py-3 border-t gap-4 items-center">
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </Card>

      {/* Invite form card — matches Card title="Invite a new member" + InviteForm */}
      <Card>
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </Card>

      {/* Pending invites card — matches Card title="Pending invites" + PendingInvites table */}
      <Card>
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-4 px-4 py-3 bg-muted/50 gap-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
          {/* Invite rows */}
          {[0, 1].map((i) => (
            <div key={i} className="grid grid-cols-4 px-4 py-3 border-t gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
