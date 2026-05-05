import { Pencil, Trash2 } from "lucide-react";
import type { Property } from "@/shared/types/property/property";
import { formatDate } from "@/shared/utils/date";
import { CLASSIFICATION_LABELS, TYPE_LABELS } from "@/shared/lib/property-labels";
import Button from "@/shared/components/ui/Button";
import Badge from "@/shared/components/ui/Badge";

export interface PropertyListItemProps {
  property: Property;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (id: string, active: boolean) => void;
  canWrite?: boolean;
}

export default function PropertyListItem({ property, onEdit, onDelete, onToggleActive, canWrite = true }: PropertyListItemProps) {
  return (
    <div className={`border rounded-lg p-4 flex items-center justify-between ${!property.is_active ? "opacity-60" : ""}`}>
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{property.name}</p>
          {!property.is_active ? <Badge label="Inactive" color="gray" /> : null}
          {property.classification === "unclassified" ? <Badge label="Needs Classification" color="yellow" /> : null}
        </div>
        {property.address ? <p className="text-sm text-muted-foreground">{property.address}</p> : null}
        <p className="text-xs text-muted-foreground">
          {CLASSIFICATION_LABELS[property.classification]}
          {property.type ? ` · ${TYPE_LABELS[property.type]}` : ""}
        </p>
        {property.activity_periods.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {property.activity_periods.map((period) => (
              <span key={period.id} className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                {formatDate(period.active_from)} – {formatDate(period.active_until)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {canWrite ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleActive(property.id, !property.is_active)}
            title={property.is_active ? "Deactivate" : "Activate"}
            className="text-xs px-2 py-1"
          >
            {property.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit} title="Edit" className="p-1.5">
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Remove" className="p-1.5 text-destructive hover:text-destructive">
            <Trash2 size={14} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
