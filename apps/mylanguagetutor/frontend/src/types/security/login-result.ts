export interface LoginResultOk {
  status: "ok";
}

export interface LoginResultTotpRequired {
  status: "totp_required";
}

export type LoginResult = LoginResultOk | LoginResultTotpRequired;
