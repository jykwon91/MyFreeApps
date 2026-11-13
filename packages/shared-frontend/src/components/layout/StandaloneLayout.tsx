import { Outlet } from "react-router-dom";
import { useScrollTopOnNavigate } from "../../hooks/useScrollTopOnNavigate";
import StandaloneMain from "./StandaloneMain";

/**
 * Layout route for the routes an app renders outside its shell (login,
 * register, password reset, email verification, the support page, 404). It
 * wraps the matched page in StandaloneMain, the page's one main landmark, and
 * goes back to the top on every new path, as the shells do. It resets both the
 * main and the window: in most apps the body is locked to the viewport and the
 * main scrolls, but in MBK the window scrolls and the main grows with its page.
 *
 *   { element: <StandaloneLayout />, children: [{ path: "/login", element: <Login /> }, ...] }
 */
export default function StandaloneLayout() {
  const mainRef = useScrollTopOnNavigate<HTMLElement>({ resetWindow: true });
  return (
    <StandaloneMain ref={mainRef}>
      <Outlet />
    </StandaloneMain>
  );
}
