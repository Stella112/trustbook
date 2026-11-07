"use client";

import { createDAppKit, DAppKitProvider, useCurrentAccount } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useEffect, useMemo } from "react";

/**
 * "Connect wallet" for the owner: fills the receiving address from the wallet they connect, so
 * nobody has to copy a 66-character address by hand. Nothing is signed; only the address is read.
 */
export function WalletFill({ onAddress }: { onAddress: (address: string) => void }) {
  const dAppKit = useMemo(
    () =>
      createDAppKit({
        networks: ["mainnet"],
        // Reads go through our read-only route, which forwards them to Tatum with the key kept on the server.
        createClient: () => new SuiGraphQLClient({ url: `${window.location.origin}/api/sui-graphql`, network: "mainnet" }),
      }),
    [],
  );
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <Fill onAddress={onAddress} />
    </DAppKitProvider>
  );
}

function Fill({ onAddress }: { onAddress: (address: string) => void }) {
  const account = useCurrentAccount();
  useEffect(() => {
    if (account?.address) onAddress(account.address);
  }, [account?.address, onAddress]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ConnectButton />
      {account && <span className="text-sm text-emerald-800">Address filled in from your wallet.</span>}
    </div>
  );
}
