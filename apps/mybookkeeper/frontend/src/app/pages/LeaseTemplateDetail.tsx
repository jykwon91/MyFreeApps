import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Skeleton from "@/shared/components/ui/Skeleton";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import {
  useDeleteLeaseTemplateMutation,
  useGetLeaseTemplateByIdQuery,
} from "@/shared/store/leaseTemplatesApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import PlaceholderSpecEditor from "@/app/features/leases/PlaceholderSpecEditor";

export default function LeaseTemplateDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const {
    data: template,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetLeaseTemplateByIdQuery(templateId ?? "", { skip: !templateId });
  const [deleteTemplate, { isLoading: isDeleting }] =
    useDeleteLeaseTemplateMutation();

  async function handleDelete() {
    if (!template) return;
    if (!window.confirm(`Delete "${template.name}"? Existing leases will be preserved.`)) {
      return;
    }
    try {
      await deleteTemplate(template.id).unwrap();
      showSuccess("Template deleted.");
      navigate("/lease-templates");
    } catch (e: unknown) {
      const err = e as { status?: number; data?: { detail?: { code?: string } } };
      if (err.status === 409 && err.data?.detail?.code === "template_in_use") {
        showError(
          "Can't delete this template — there are active leases referencing it.",
        );
      } else {
        showError("Couldn't delete that. Want to try again?");
      }
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <Link
        to="/lease-templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to templates
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't find that template. Maybe it was deleted?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading || !template ? (
        !isError ? (
          <div className="space-y-4" data-testid="lease-template-detail-skeleton">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32" />
          </div>
        ) : null
      ) : (
        <>
          <SectionHeader
            title={template.name}
            subtitle={
              <span className="inline-flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <span>v{template.version}</span>
                <span>·</span>
                <span>{template.files.length} files</span>
                <span>·</span>
                <span>{template.placeholders.length} placeholders</span>
              </span>
            }
            actions={
              canWrite ? (
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  isLoading={isDeleting}
                  loadingText="Deleting..."
                  onClick={handleDelete}
                  data-testid="lease-template-delete"
                >
                  <Trash2 size={14} className="mr-1" />
                  Delete
                </LoadingButton>
              ) : null
            }
          />

          {template.description ? (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          ) : null}

          {/* Files */}
          <section className="space-y-2" data-testid="template-files-section">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">
              Source files
            </h2>
            <ul className="space-y-2">
              {template.files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                >
                  <span className="truncate" data-testid={`template-file-${f.id}`}>
                    {f.filename}
                  </span>
                  {f.presigned_url ? (
                    <a
                      href={f.presigned_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      data-testid={`template-file-download-${f.id}`}
                    >
                      <Download size={14} />
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Storage offline</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Placeholders */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">
              Placeholders
            </h2>
            <PlaceholderSpecEditor
              templateId={template.id}
              placeholders={template.placeholders}
            />
          </section>
        </>
      )}
    </main>
  );
}
