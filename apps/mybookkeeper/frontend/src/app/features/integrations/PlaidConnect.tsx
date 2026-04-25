import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import {
  useCreateLinkTokenMutation,
  useExchangePublicTokenMutation,
} from "@/shared/store/plaidApi";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";

interface Props {
  onSuccess: (institutionName: string) => void;
  onError: (message: string) => void;
}

export default function PlaidConnect({ onSuccess, onError }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [createLinkToken, { isLoading: isCreating }] = useCreateLinkTokenMutation();
  const [exchangePublicToken, { isLoading: isExchanging }] = useExchangePublicTokenMutation();

  const handleOnSuccess = useCallback(
    (publicToken: string) => {
      exchangePublicToken({ public_token: publicToken })
        .unwrap()
        .then((item) => onSuccess(item.institution_name ?? "your bank"))
        .catch((err) => onError(`I couldn't connect that account: ${extractErrorMessage(err)}`));
    },
    [exchangePublicToken, onSuccess, onError],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleOnSuccess,
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const handleClick = useCallback(() => {
    createLinkToken()
      .unwrap()
      .then((data) => setLinkToken(data.link_token))
      .catch((err) => onError(`I couldn't start the bank connection: ${extractErrorMessage(err)}`));
  }, [createLinkToken, onError]);

  return (
    <LoadingButton
      onClick={handleClick}
      isLoading={isCreating || isExchanging}
      loadingText="Connecting..."
    >
      Connect Bank Account
    </LoadingButton>
  );
}
