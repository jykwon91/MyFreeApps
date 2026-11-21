export interface ModalDialogProps {
  /** Test id of the dialog panel. */
  testId: string;
  onClose: () => void;
  /** Classes for the dialog panel itself: width, padding, background, layout. */
  panelClassName: string;
  /**
   * Classes for the backdrop, which also lays the panel out. Defaults to a
   * dimmed full-screen backdrop that centres the panel.
   */
  overlayClassName?: string;
  /** Test id of the backdrop. */
  overlayTestId?: string;
  /**
   * When true, a click on the backdrop calls `onClose`. Off by default, so a
   * stray click can't throw away a half-filled form.
   */
  closeOnBackdropClick?: boolean;
  /**
   * While true, Escape and a backdrop click leave the dialog open, for a
   * dialog whose own Cancel is disabled while its work is in flight.
   */
  preventClose?: boolean;
  /** Set when the children render a `Dialog.Description`, so it is announced with the title. */
  hasDescription?: boolean;
  /** Must include a `Dialog.Title` so the dialog has an accessible name. */
  children: React.ReactNode;
}
