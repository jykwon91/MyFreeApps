import { Link } from "react-router-dom";
import Card from "@/shared/components/ui/Card";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import { PERSONAL_FINANCES_LINKS } from "@/shared/lib/personal-finances-pages";

/** With no bank connected there is nothing this page can count yet. */
export default function PersonalFinancesNoBank() {
  return (
    <div data-testid="personal-finances-no-bank">
      <Card className="text-center py-12">
        <p className="font-medium mb-2">{MSG.noBankTitle}</p>
        <p className="text-sm text-muted-foreground mb-4 max-w-prose mx-auto">{MSG.noBankBody}</p>
        <Link
          to={PERSONAL_FINANCES_LINKS.financialAccounts}
          className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {MSG.noBankAction}
        </Link>
      </Card>
    </div>
  );
}
