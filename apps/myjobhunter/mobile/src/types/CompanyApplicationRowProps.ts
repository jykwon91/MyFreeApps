import type { Application } from "@myjobhunter/api-client/types/application";

export interface CompanyApplicationRowProps {
  application: Application;
  onPress: () => void;
}
