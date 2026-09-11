/**
 * Fictional companies + job applications for the MyJobHunter portfolio seed.
 *
 * Every company, role, and person here is invented for this demo. Dates are
 * expressed as "days ago" from whenever the seed runs, spreading the
 * pipeline across roughly the last six weeks so the dashboard/kanban/list
 * views show a believable spread of activity.
 */

export interface ContactFixture {
  name?: string;
  email?: string;
  role: string;
  notes?: string;
}

export interface InterviewDetailsFixture {
  type: "phone" | "video" | "onsite" | "panel";
  scheduledDaysAgo?: number; // negative = in the future
  durationMinutes?: number;
  locationOrLink?: string;
  interviewerNames?: string[];
}

export interface EventFixture {
  eventType: string;
  daysAgo: number;
  note?: string;
  interviewDetails?: InterviewDetailsFixture;
}

export interface ApplicationFixture {
  companyName: string;
  companyDomain: string;
  companyIndustry: string;
  companySize: string;
  roleTitle: string;
  location: string;
  remoteType: "remote" | "hybrid" | "onsite" | "unknown";
  source: string;
  appliedDaysAgo: number;
  salaryMin?: number;
  salaryMax?: number;
  fitScore?: number;
  notes?: string;
  events: EventFixture[];
  contacts?: ContactFixture[];
  /** When set, the seed script also exercises POST /applications/parse-jd with this text. */
  jdText?: string;
}

export const applications: ApplicationFixture[] = [
  {
    companyName: "Northwind Cloud Systems",
    companyDomain: "northwindcloud.example",
    companyIndustry: "Cloud infrastructure",
    companySize: "201-1000",
    roleTitle: "Senior Backend Engineer",
    location: "Remote (US)",
    remoteType: "remote",
    source: "linkedin",
    appliedDaysAgo: 38,
    salaryMin: 155000,
    salaryMax: 185000,
    fitScore: 82,
    events: [{ eventType: "applied", daysAgo: 38 }],
  },
  {
    companyName: "Fernbridge Analytics",
    companyDomain: "fernbridgeanalytics.example",
    companyIndustry: "Data analytics",
    companySize: "51-200",
    roleTitle: "Staff Software Engineer",
    location: "Portland, OR",
    remoteType: "hybrid",
    source: "referral",
    appliedDaysAgo: 36,
    salaryMin: 170000,
    salaryMax: 205000,
    fitScore: 88,
    notes: "Referred by a former Harborlight Data teammate now on their platform team.",
    events: [
      { eventType: "applied", daysAgo: 36 },
      {
        eventType: "interview_scheduled",
        daysAgo: 21,
        note: "Recruiter screen went well — moving to a technical round with the platform lead.",
        interviewDetails: {
          type: "video",
          scheduledDaysAgo: -4,
          durationMinutes: 60,
          locationOrLink: "Google Meet (link in calendar invite)",
          interviewerNames: ["Priya Nathan"],
        },
      },
    ],
    contacts: [
      { name: "Priya Nathan", email: "priya.nathan@fernbridgeanalytics.example", role: "recruiter" },
    ],
    jdText:
      "Fernbridge Analytics is hiring a Staff Software Engineer to lead design of our " +
      "real-time metrics pipeline. You'll own service architecture for a team of 6, " +
      "work closely with the data science org, and drive our migration to a " +
      "streaming-first ingestion model. 8+ years backend experience, strong Postgres " +
      "and Kafka background, and experience mentoring senior engineers required. " +
      "Hybrid — 2 days/week in our Portland, OR office. Salary range $170,000-$205,000.",
  },
  {
    companyName: "Cascadia DevTools",
    companyDomain: "cascadiadevtools.example",
    companyIndustry: "Developer tools",
    companySize: "11-50",
    roleTitle: "Backend Engineer",
    location: "Remote (US)",
    remoteType: "remote",
    source: "indeed",
    appliedDaysAgo: 43,
    salaryMin: 140000,
    salaryMax: 165000,
    fitScore: 74,
    events: [
      { eventType: "applied", daysAgo: 43 },
      { eventType: "interview_scheduled", daysAgo: 33 },
      {
        eventType: "interview_completed",
        daysAgo: 24,
        note: "45-minute system design round — walked through the order-processing migration from Solstice. Felt strong.",
        interviewDetails: {
          type: "video",
          scheduledDaysAgo: 24,
          durationMinutes: 45,
          locationOrLink: "Zoom",
          interviewerNames: ["Dana Okafor", "Marcus Webb"],
        },
      },
      { eventType: "note_added", daysAgo: 20, note: "Recruiter said they're finishing up the last few panels this week — expect an update by Friday." },
    ],
    contacts: [
      { name: "Dana Okafor", email: "dana.okafor@cascadiadevtools.example", role: "hiring_manager" },
      { name: "Marcus Webb", role: "interviewer" },
    ],
  },
  {
    companyName: "Bramblewood Robotics",
    companyDomain: "bramblewoodrobotics.example",
    companyIndustry: "Robotics",
    companySize: "201-1000",
    roleTitle: "Full Stack Engineer",
    location: "Seattle, WA",
    remoteType: "hybrid",
    source: "greenhouse",
    appliedDaysAgo: 45,
    salaryMin: 150000,
    salaryMax: 180000,
    fitScore: 79,
    events: [
      { eventType: "applied", daysAgo: 45 },
      { eventType: "interview_scheduled", daysAgo: 38 },
      {
        eventType: "interview_completed",
        daysAgo: 30,
        interviewDetails: { type: "onsite", scheduledDaysAgo: 30, durationMinutes: 240, locationOrLink: "Bramblewood HQ, Seattle" },
      },
      { eventType: "offer_received", daysAgo: 13, note: "Verbal offer from the hiring manager — written offer to follow. Base $172k + equity." },
    ],
    contacts: [
      { name: "Renee Castillo", email: "renee.castillo@bramblewoodrobotics.example", role: "hiring_manager" },
    ],
  },
  {
    companyName: "Solace Health Tech",
    companyDomain: "solacehealthtech.example",
    companyIndustry: "Healthcare software",
    companySize: "51-200",
    roleTitle: "Senior Software Engineer",
    location: "Remote (US)",
    remoteType: "remote",
    source: "linkedin",
    appliedDaysAgo: 41,
    salaryMin: 145000,
    salaryMax: 170000,
    fitScore: 68,
    events: [
      { eventType: "applied", daysAgo: 41 },
      { eventType: "interview_scheduled", daysAgo: 33 },
      { eventType: "rejected", daysAgo: 27, note: "Passed after the technical screen — team decided to hire someone with more direct HIPAA compliance experience." },
    ],
  },
  {
    companyName: "Ironleaf Systems",
    companyDomain: "ironleafsystems.example",
    companyIndustry: "Enterprise infrastructure",
    companySize: "1001-5000",
    roleTitle: "Platform Engineer",
    location: "Austin, TX",
    remoteType: "onsite",
    source: "direct",
    appliedDaysAgo: 32,
    salaryMin: 150000,
    salaryMax: 175000,
    fitScore: 55,
    events: [
      { eventType: "applied", daysAgo: 32 },
      { eventType: "withdrawn", daysAgo: 20, note: "Withdrew after the recruiter call — on-site only, no relocation support, and the on-call rotation was heavier than I'm looking for right now." },
    ],
  },
  {
    companyName: "Meridian Data Co",
    companyDomain: "meridiandataco.example",
    companyIndustry: "Data infrastructure",
    companySize: "51-200",
    roleTitle: "Backend Engineer",
    location: "Remote (US)",
    remoteType: "remote",
    source: "ziprecruiter",
    appliedDaysAgo: 39,
    salaryMin: 135000,
    salaryMax: 160000,
    fitScore: 61,
    events: [{ eventType: "applied", daysAgo: 39 }, { eventType: "ghosted", daysAgo: 11, note: "No response after the initial application — recruiter never replied to a follow-up either." }],
  },
  {
    companyName: "Thistledown Labs",
    companyDomain: "thistledownlabs.example",
    companyIndustry: "Applied AI",
    companySize: "11-50",
    roleTitle: "Senior Engineer",
    location: "Remote (US)",
    remoteType: "remote",
    source: "referral",
    appliedDaysAgo: 24,
    salaryMin: 160000,
    salaryMax: 190000,
    fitScore: 85,
    notes: "Small team, interesting problem space. Recruiter mentioned the role reports directly to the CTO.",
    events: [
      { eventType: "applied", daysAgo: 24 },
      { eventType: "note_added", daysAgo: 17, note: "Checked Glassdoor — mixed reviews on work-life balance but strong on comp. Still worth pursuing." },
    ],
  },
  {
    companyName: "Ashgrove Technologies",
    companyDomain: "ashgrovetech.example",
    companyIndustry: "B2B SaaS",
    companySize: "201-1000",
    roleTitle: "Software Engineer II",
    location: "Denver, CO",
    remoteType: "hybrid",
    source: "workday",
    appliedDaysAgo: 10,
    salaryMin: 130000,
    salaryMax: 155000,
    fitScore: 63,
    events: [
      { eventType: "applied", daysAgo: 10 },
      { eventType: "follow_up_sent", daysAgo: 3, note: "Sent a short follow-up email to the recruiter checking on status." },
    ],
  },
  {
    companyName: "Quill & Arrow Software",
    companyDomain: "quillandarrow.example",
    companyIndustry: "Developer productivity",
    companySize: "11-50",
    roleTitle: "Senior Backend Engineer",
    location: "Remote (US)",
    remoteType: "remote",
    source: "greenhouse",
    appliedDaysAgo: 15,
    salaryMin: 160000,
    salaryMax: 195000,
    fitScore: 91,
    notes: "Best fit so far — small backend team, strong Postgres + event-driven focus, matches Solstice work closely.",
    events: [
      { eventType: "applied", daysAgo: 15 },
      {
        eventType: "interview_scheduled",
        daysAgo: 1,
        note: "Recruiter screen booked for next week.",
        interviewDetails: { type: "phone", scheduledDaysAgo: -6, durationMinutes: 30, locationOrLink: "Phone — recruiter will call" },
      },
    ],
    contacts: [
      { name: "Jordan Lee", email: "jordan.lee@quillandarrow.example", role: "recruiter", notes: "Very responsive, replied within a few hours each time." },
    ],
    jdText:
      "Quill & Arrow Software is looking for a Senior Backend Engineer to join our " +
      "6-person platform team. You'll design and own core services powering our " +
      "developer productivity suite, working primarily in Go and Python against " +
      "PostgreSQL and Kafka. We're a small, senior team that ships fast and expects " +
      "you to drive architecture decisions with minimal oversight. 6+ years backend " +
      "experience required; distributed systems and event-driven architecture " +
      "experience strongly preferred. Fully remote (US). Salary range $160,000-$195,000.",
  },
];
