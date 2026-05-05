import Spinner from "@/shared/components/icons/Spinner";

export default function ClassificationRulesLoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner />
    </div>
  );
}
