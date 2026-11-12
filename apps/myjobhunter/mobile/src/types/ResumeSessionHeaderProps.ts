export interface ResumeSessionHeaderProps {
  /** "Cancel" while preparing: it leaves a wait rather than choosing among sessions. */
  label: string;
  onStartNew: () => void;
}
