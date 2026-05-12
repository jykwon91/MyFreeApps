import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import type { AxiosError } from "axios";
import api from "../lib/api";
import type { Args } from "../types/api-args";
import type { ApiError } from "../types/api-error";

export const axiosBaseQuery: BaseQueryFn<Args, unknown, ApiError> = async ({
  url,
  method = "GET",
  data,
  params,
}) => {
  try {
    const result = await api({ url, method, data, params });
    return { data: result.data };
  } catch (err) {
    const error = err as AxiosError;
    return {
      error: {
        status: error.response?.status,
        data: error.response?.data ?? error.message,
      },
    };
  }
};
