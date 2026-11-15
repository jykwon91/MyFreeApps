import { AxiosError, type InternalAxiosRequestConfig } from "axios";

/** What axios rejects with when the server answers `config`'s request with a 500. */
export function serverError(config: InternalAxiosRequestConfig): AxiosError {
  const response = { status: 500, data: { detail: "Internal Server Error" }, statusText: "", headers: {}, config };
  return new AxiosError("Request failed with status code 500", AxiosError.ERR_BAD_RESPONSE, config, null, response);
}
