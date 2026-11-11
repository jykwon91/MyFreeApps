import type { Education } from "@myjobhunter/api-client/types/education/education";
import type { Profile } from "@myjobhunter/api-client/types/profile/profile";
import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";
import type { Skill } from "@myjobhunter/api-client/types/skill/skill";
import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";

/** What the fake server starts out holding for the Profile tab. */
export interface ProfileSeed {
  profile?: Profile;
  workHistory?: WorkHistory[];
  education?: Education[];
  skills?: Skill[];
  answers?: ScreeningAnswer[];
}
