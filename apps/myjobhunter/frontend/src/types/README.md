# Types

Web-only types: form state, UI view modes, and anything that touches the
browser (for example a `File` from an `<input type="file">`).

API request/response types live in `@myjobhunter/api-client`
(`apps/myjobhunter/api-client/src/types/`), shared by the web app and the
phone app. Import them from there, e.g.
`@myjobhunter/api-client/types/application/applications-filter`.

Convention: one type/interface per file.
