import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { startCompanyResearchRun } from "../../store/companiesApi";

/** A store's dispatch, as far as starting a company's research needs: it reaches the api's cache. */
export type CompanyResearchDispatch = ThunkDispatch<
  ReturnType<Parameters<ReturnType<typeof startCompanyResearchRun>>[1]>,
  unknown,
  UnknownAction
>;
