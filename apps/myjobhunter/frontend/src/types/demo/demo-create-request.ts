/**
 * Body of `POST /admin/demo/users`.
 *
 * Both fields are optional. When `email` is omitted the backend
 * auto-generates `demo+<uuid>@myjobhunter.local`. When `display_name`
 * is omitted the backend defaults to "Alex Demo" — the seeded
 * profile's name.
 */
export interface DemoCreateRequest {
  email?: string;
  display_name?: string;
}
